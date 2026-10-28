import { localBackend } from './local-backend-check.mjs';
import { localPostgres } from './support/local-postgres.mjs';
import { rankingDefinition } from './support/ranking-version.mjs';

// Full JSON stays in a temporary table, never in an artifact or stdout. Exercise
// the actual PostgreSQL engine on the same large fixture used by the load test.
const config = localBackend();
let setup = `begin;
  set local statement_timeout='60s';
  create temporary table ranking_expected(viewer integer, filters jsonb, page integer, answer jsonb);
  grant select,insert on ranking_expected to authenticated;
  ${await rankingDefinition(true)}
  set local role authenticated;
`;
const filters = [{}, { start_date: '2099-01-01', end_date: '2099-01-05', tolerance_days: 2 },
  { landscapes: ['coast', 'lake'], group_kinds: ['family'] }];
for (const viewer of [1, 37, 200]) {
  const claims = `jsonb_build_object('sub',md5('synthetic-user-${viewer}')::uuid,
    'session_id',md5('synthetic-session-${viewer}')::uuid,'role','authenticated')::text`;
  setup += `select set_config('request.jwt.claims',${claims},true);\n`;
  for (const filter of filters) {
    const f = `'${JSON.stringify(filter)}'::jsonb`;
    setup += `insert into ranking_expected values(${viewer},${f},1,public.search_public_trips(${f},'compatibility',null,5));
      insert into ranking_expected select ${viewer},${f},2,
        public.search_public_trips(${f},'compatibility',answer->'cursor',5)
        from ranking_expected where viewer=${viewer} and filters=${f} and page=1 and (answer->>'has_more')::boolean;
    `;
  }
}
setup += `reset role; ${await rankingDefinition()} set local role authenticated;\n`;
for (const viewer of [1, 37, 200]) {
  setup += `select set_config('request.jwt.claims',jsonb_build_object(
    'sub',md5('synthetic-user-${viewer}')::uuid,'session_id',md5('synthetic-session-${viewer}')::uuid,'role','authenticated')::text,true);
    do $$ declare row record; actual jsonb; cursor_value jsonb; begin
      for row in select * from ranking_expected where viewer=${viewer} order by filters::text,page loop
        cursor_value:=null;
        if row.page=2 then select answer->'cursor' into cursor_value from ranking_expected
          where viewer=row.viewer and filters=row.filters and page=1; end if;
        actual:=public.search_public_trips(row.filters,'compatibility',cursor_value,5);
        if actual is distinct from row.answer then raise exception 'Ranking parity failed'; end if;
      end loop;
    end $$;\n`;
}
// set_config returns claims, so suppress all psql output at the transport layer
// and return only this validated aggregate after executing the comparisons.
setup += `select count(*) from ranking_expected; rollback;`;
const result = localPostgres(config, setup);
const count = result.stdout.trim().split(/\r?\n/).at(-1);
if (!/^\d+$/.test(count) || Number(count) < 9) throw Error('Ranking comparison incomplete');
console.log(JSON.stringify({ parity: true, comparedPages: Number(count), viewers: 3, filters: filters.length }));
