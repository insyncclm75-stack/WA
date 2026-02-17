

## Enhanced Template Builder: Preview, Samples, and Media Uploads

### 1. Live WhatsApp Message Preview

A phone-mockup style preview panel will be added to the right side of the template submission dialog. As you type in each field (header, body, footer, buttons), the preview updates in real-time showing how the message will appear on WhatsApp. Placeholder values like `{{1}}` will be replaced with the example values you provide.

### 2. Sample/Placeholder Text for All Fields

Each field will show helpful sample text to guide you:
- **Template Name**: Pre-filled hint like `order_confirmation_01`
- **Header**: Sample text like `Order Update` or description for media headers
- **Body**: A realistic sample such as `Hi {{1}}, your order {{2}} has been confirmed and will be delivered by {{3}}.`
- **Footer**: Sample like `Reply STOP to opt out`
- **Buttons**: Contextual samples based on button type

A "Load Sample Template" button will auto-fill all fields with a complete realistic example so you can see how it works.

### 3. Media Header Support (Image and Video Upload)

The Header type dropdown will be expanded from just "No Header / Text" to include:
- **No Header**
- **Text Header**
- **Image Header** -- with file upload (JPG, PNG only, max 5 MB)
- **Video Header** -- with file upload (MP4 only, max 16 MB)

File size limits will be validated on selection with clear error messages shown inline (e.g., "Image must be under 5 MB. Selected file is 7.2 MB."). Invalid file types will also be rejected with a message.

Uploaded media files will be stored in a dedicated storage bucket and their URL passed to the Exotel API as part of the header component.

### 4. Storage Bucket for Template Media

A new `template-media` storage bucket will store uploaded header images and videos. RLS policies will ensure only authenticated users can upload and read their own files.

---

### Technical Details

**Files to modify:**

| File | Changes |
|------|---------|
| `src/pages/Settings.tsx` | Add WhatsApp preview panel, expand header types to IMAGE/VIDEO, add file upload with validation, add sample text and "Load Sample" button |
| `supabase/functions/manage-templates/index.ts` | Accept media URL in header component and pass to Exotel API |
| DB migration | Create `template-media` storage bucket with RLS policies |

**File upload validation rules:**
- Image: JPG, PNG only; max 5 MB
- Video: MP4 only; max 16 MB
- Error shown inline below the upload field with red text
- File input is cleared on invalid selection

**Preview component behavior:**
- Styled as a WhatsApp chat bubble (green background, rounded corners, timestamp)
- Shows header (text or media thumbnail), body with resolved placeholders, footer in lighter text, and buttons as tappable-looking elements
- Updates live as form fields change

