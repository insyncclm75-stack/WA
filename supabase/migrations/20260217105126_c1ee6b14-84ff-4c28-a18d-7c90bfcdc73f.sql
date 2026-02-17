-- Create templates table for WhatsApp template management
CREATE TABLE public.templates (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT DEFAULT 'MARKETING',
    language TEXT DEFAULT 'en',
    status TEXT DEFAULT 'pending', -- pending, approved, rejected
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can manage their own templates" 
ON public.templates 
FOR ALL 
USING (auth.uid() = user_id);

-- Create trigger for updated_at
CREATE TRIGGER update_templates_updated_at
BEFORE UPDATE ON public.templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add template_id to campaigns for linking
ALTER TABLE public.campaigns ADD COLUMN template_id UUID REFERENCES public.templates(id) ON DELETE SET NULL;
