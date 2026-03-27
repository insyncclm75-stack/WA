-- Backfill outbound messages stuck at "sent" status to "delivered"
-- These messages were sent successfully but delivery callbacks were routed
-- to whatsapp-webhook (inbound handler) instead of message-status-callback,
-- so delivery confirmations were silently discarded.
--
-- Targets: echocommunicator org, 15 outbound messages with status = 'sent'

update messages
set    status       = 'delivered',
       delivered_at = coalesce(sent_at, now())
where  status = 'sent'
  and  direction = 'outbound'
  and  org_id in (
         select id from organizations
         where  slug = 'echocommunicator'
            or  name ilike '%echocommunicator%'
            or  name ilike '%echo communicator%'
       );
