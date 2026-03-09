-- Add buttons column to templates for storing button config
ALTER TABLE templates ADD COLUMN IF NOT EXISTS buttons JSONB DEFAULT '[]';

-- Add interactive message support to messages table
ALTER TABLE messages ADD COLUMN IF NOT EXISTS message_type TEXT NOT NULL DEFAULT 'text';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS interactive_data JSONB;
