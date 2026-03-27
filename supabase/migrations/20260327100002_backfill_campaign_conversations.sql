-- Backfill: create conversations for campaign messages that have no conversation_id
-- and link them so replies appear in the same thread.

-- Step 1: Create missing conversations for contacts that received campaign messages
-- but have no conversation record yet
insert into conversations (org_id, contact_id, phone_number, last_message_at, last_message_preview, status, ai_enabled)
select distinct on (m.org_id, m.contact_id)
       m.org_id,
       m.contact_id,
       c.phone_number,
       m.created_at,
       '[Campaign] ' || left(m.content, 90),
       'open',
       true
from   messages m
join   contacts c on c.id = m.contact_id
where  m.conversation_id is null
  and  m.campaign_id is not null
  and  not exists (
         select 1 from conversations cv
         where  cv.org_id = m.org_id
           and  cv.contact_id = m.contact_id
       )
order by m.org_id, m.contact_id, m.created_at desc;

-- Step 2: Link all orphaned campaign messages to their contact's conversation
update messages m
set    conversation_id = cv.id,
       direction = 'outbound'
from   conversations cv
where  cv.org_id = m.org_id
  and  cv.contact_id = m.contact_id
  and  m.conversation_id is null
  and  m.campaign_id is not null;
