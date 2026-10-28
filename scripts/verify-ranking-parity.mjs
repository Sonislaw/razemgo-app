import { localBackend } from './local-backend-check.mjs';
import { localPostgres } from './support/local-postgres.mjs';
import { rankingDefinition } from './support/ranking-version.mjs';

// Full JSON stays in a temporary table, never in an artifact or stdout. Exercise
// the actual PostgreSQL engine on the same large fixture used by the load test.
const config = localBackend();
let setup = `begin;
  set local statement_timeout='60s';
  create temporary table ranking_expected(viewer integer, rpc text, filters jsonb, page integer, answer jsonb);
  grant select,insert on ranking_expected to authenticated;
  ${await rankingDefinition(true)}
  set local role authenticated;
`;
const tripFilters = ["'{}'::jsonb",
  "jsonb_build_object('start_date',current_date+10,'end_date',current_date+16,'tolerance_days',2)",
  "'{\"landscapes\":[\"coast\",\"lake\"],\"group_kinds\":[\"family\"]}'::jsonb"];
const groupFilters = ["'{}'::jsonb", "'{\"name\":\"Ekipa\"}'::jsonb",
  "'{\"group_kinds\":[\"family\"],\"child_age_bands\":[\"4–6\"]}'::jsonb"];
for (const viewer of [1, 37, 200]) {
  const claims = `jsonb_build_object('sub',md5('synthetic-user-${viewer}')::uuid,
    'session_id',md5('synthetic-session-${viewer}')::uuid,'role','authenticated')::text`;
  setup += `select set_config('request.jwt.claims',${claims},true);\n`;
  for (const [rpc, filters] of [['search_public_trips', tripFilters], ['list_ranked_public_groups', groupFilters]])
    for (const f of filters) {
    setup += `insert into ranking_expected values(${viewer},'${rpc}',${f},1,public.${rpc}(${f},'compatibility',null,5));
      insert into ranking_expected select ${viewer},'${rpc}',${f},2,
        public.${rpc}(${f},'compatibility',answer->'cursor',5)
        from ranking_expected where viewer=${viewer} and rpc='${rpc}' and filters=${f} and page=1 and (answer->>'has_more')::boolean;
    `;
  }
}
setup += `reset role; ${await rankingDefinition()} set local role authenticated;\n`;
for (const viewer of [1, 37, 200]) {
  setup += `select set_config('request.jwt.claims',jsonb_build_object(
    'sub',md5('synthetic-user-${viewer}')::uuid,'session_id',md5('synthetic-session-${viewer}')::uuid,'role','authenticated')::text,true);
    do $$ declare row record; actual jsonb; cursor_value jsonb; begin
      for row in select * from ranking_expected where viewer=${viewer} order by rpc,filters::text,page loop
        cursor_value:=null;
        if row.page=2 then select answer->'cursor' into cursor_value from ranking_expected
          where viewer=row.viewer and rpc=row.rpc and filters=row.filters and page=1; end if;
        actual:=case when row.rpc='search_public_trips' then public.search_public_trips(row.filters,'compatibility',cursor_value,5)
          else public.list_ranked_public_groups(row.filters,'compatibility',cursor_value,5) end;
        if actual is distinct from row.answer then raise exception 'Ranking parity failed'; end if;
      end loop;
    end $$;\n`;
}
// set_config returns claims, so suppress all psql output at the transport layer
// and return only this validated aggregate after executing the comparisons.
setup += `select count(*) from ranking_expected; rollback;`;
const result = localPostgres(config, setup);
const count = result.stdout.trim().split(/\r?\n/).at(-1);
if (!/^\d+$/.test(count) || Number(count) < 18) throw Error('Ranking comparison incomplete');
console.log(JSON.stringify({ parity: true, comparedPages: Number(count), viewers: 3, filtersPerRpc: 3, rpcs: 2 }));
