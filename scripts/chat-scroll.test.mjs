import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createChatScrollController} from '../src/features/messaging/chat-scroll.ts';
import {MESSAGE_REACTIONS,parseMessageReaction} from '../src/features/messaging/message-reactions-data.ts';

test('chat opens at the newest page once; read receipts, reactions and background sync do not trigger another scroll',()=>{
  const chat=createChatScrollController();
  chat.messagesChanged('last',false);assert.equal(chat.contentChanged(),false);
  chat.messagesChanged('last',true);assert.equal(chat.contentChanged(),true);
  chat.messagesChanged('last',true);assert.equal(chat.contentChanged(),false);
  assert.equal(chat.contentChanged(),false);
  chat.messagesChanged('new',true);assert.equal(chat.contentChanged(),true);
});
test('reading older messages survives keyboard viewport changes, prepends, receipt updates and incoming messages',()=>{
  const chat=createChatScrollController();chat.messagesChanged('last',true);chat.contentChanged();chat.viewportChanged(600);
  chat.scrolled(400,3000,600);assert.equal(chat.isAtBottom(),false);
  assert.equal(chat.viewportChanged(350),false);
  chat.messagesChanged('last',true);assert.equal(chat.contentChanged(),false);
  chat.messagesChanged('incoming',true);assert.equal(chat.contentChanged(),false);
  assert.equal(chat.viewportChanged(600),false);
  chat.requestBottom();chat.messagesChanged('outbox-request-key',true);assert.equal(chat.contentChanged(),true);
  chat.messagesChanged('outbox-request-key',true);assert.equal(chat.contentChanged(),false);
});
test('a keyboard resize keeps following the bottom without letting its intermediate scroll event change intent',()=>{
  const chat=createChatScrollController();chat.messagesChanged('last',true);chat.contentChanged();chat.viewportChanged(600);
  chat.scrolled(0,3000,600);assert.equal(chat.isAtBottom(),true);
  chat.scrolled(250,3000,350);assert.equal(chat.isAtBottom(),true);
  assert.equal(chat.viewportChanged(350),true);chat.scrolled(0,3000,350);assert.equal(chat.isAtBottom(),true);
  chat.readingOlder();assert.equal(chat.contentChanged(),false);assert.equal(chat.viewportChanged(600),false);
});
test('message reactions accept only the six supported choices and confirmed removals',()=>{
  for(const option of MESSAGE_REACTIONS)assert.deepEqual(parseMessageReaction({message_id:'message',kind:option.kind}),{message_id:'message',kind:option.kind});
  assert.deepEqual(parseMessageReaction({message_id:'message',kind:null}),{message_id:'message',kind:null});
  for(const row of [null,{}, {message_id:1,kind:'love'},{message_id:'m',kind:'angry'}])assert.throws(()=>parseMessageReaction(row));
});
