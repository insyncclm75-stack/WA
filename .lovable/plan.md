

## Real Exotel WhatsApp Template Integration

You're right -- the current template system is a mock that just saves templates locally and auto-marks them as "approved" without ever talking to Exotel. Here's the plan to make it real.

---

### What Changes

**1. New Secret: `EXOTEL_WABA_ID`**
The Exotel template APIs require your WhatsApp Business Account (WABA) ID. I'll prompt you to provide this value.

**2. New Edge Function: `manage-templates`**
A backend function that communicates with Exotel's real API. It will support three actions:

- **Submit** -- `POST /v2/accounts/{sid}/templates?waba_id={waba_id}` to create and submit a template to WhatsApp for approval via Exotel. The template starts with status `pending` in our database.
- **Sync** -- `GET /v2/accounts/{sid}/templates?waba_id={waba_id}` to fetch the latest template statuses from Exotel and update our database (approved, rejected, pending).
- **Delete** -- `DELETE /v2/accounts/{sid}/templates?waba_id={waba_id}&name={name}` to remove a template from Exotel.

**3. Database Update: `templates` table**
Add an `exotel_template_id` column to store the Exotel-side ID returned when a template is submitted.

**4. Updated Settings Page (`src/pages/Settings.tsx`)**
The UI will change to reflect the real workflow:

- **"Add New Template" dialog** -- Enhanced with proper WhatsApp template structure:
  - Header (optional, text or media format)
  - Body (required, with `{{1}}`, `{{2}}` placeholders)
  - Footer (optional)
  - Buttons (optional: URL, phone number, quick reply)
  - Example values for each placeholder (required by WhatsApp for approval)
- **Status is real** -- Templates are created as `pending` and the badge reflects the actual Exotel/WhatsApp approval status.
- **"Sync Status" button** -- Fetches latest statuses from Exotel for all templates and updates the database.
- **"Refresh from Exotel" capability** -- Pulls all existing templates from your Exotel account so you can import ones already approved.
- Delete calls the Exotel API to also remove from WhatsApp.

**5. Updated Campaign Builder (`src/pages/Campaigns.tsx`)**
Only templates with `approved` status can be selected when creating a campaign (already partially in place, will be enforced).

---

### Technical Details

```text
User clicks "Submit Template"
       |
       v
Frontend --> manage-templates Edge Function (action: "submit")
       |
       v
Edge Function --> POST Exotel API /v2/accounts/{sid}/templates?waba_id=...
       |
       v
Exotel submits to WhatsApp for review --> returns template ID
       |
       v
Edge Function saves to DB with status="pending", exotel_template_id=...
       |
       v
User clicks "Sync Status" later
       |
       v
Edge Function --> GET Exotel API /v2/accounts/{sid}/templates?waba_id=...
       |
       v
Updates all template statuses in DB (approved/rejected/pending)
```

### Files to Create/Modify

| File | Action |
|------|--------|
| `supabase/functions/manage-templates/index.ts` | Create -- handles submit, sync, delete via Exotel API |
| `src/pages/Settings.tsx` | Modify -- real template form with components, sync button |
| `src/pages/Campaigns.tsx` | Minor -- ensure only approved templates selectable |
| DB migration | Add `exotel_template_id` column to `templates` table |
| Secret | Add `EXOTEL_WABA_ID` |

