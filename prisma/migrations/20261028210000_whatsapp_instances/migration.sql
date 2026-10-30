CREATE TABLE whatsapp_instances (
 id text PRIMARY KEY,"organizationId" text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE ON UPDATE CASCADE,
 "locationId" text NOT NULL REFERENCES locations(id) ON DELETE CASCADE ON UPDATE CASCADE,
 name text NOT NULL,session text NOT NULL,status text NOT NULL DEFAULT 'PENDING',"createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX whatsapp_instances_session_key ON whatsapp_instances(session);
CREATE UNIQUE INDEX "whatsapp_instances_organizationId_locationId_key" ON whatsapp_instances("organizationId","locationId");
CREATE TABLE whatsapp_recipients (
 id text PRIMARY KEY,"organizationId" text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE ON UPDATE CASCADE,
 phone text NOT NULL,name text NOT NULL
);
CREATE UNIQUE INDEX "whatsapp_recipients_organizationId_phone_key" ON whatsapp_recipients("organizationId",phone);
-- Preserve a previously configured, valid individual number. Groups are not
-- phone recipients and are intentionally not converted into phone records.
INSERT INTO whatsapp_recipients(id,"organizationId",phone,name)
SELECT 'legacy-' || id,id,regexp_replace(settings->'whatsappAlerts'->>'recipientPhone','[^0-9]','','g'),
  COALESCE(settings->'whatsappAlerts'->>'recipientName','')
FROM organizations
WHERE settings->'whatsappAlerts'->>'recipientPhone' NOT LIKE '%@%'
  AND length(regexp_replace(settings->'whatsappAlerts'->>'recipientPhone','[^0-9]','','g')) BETWEEN 8 AND 15;
