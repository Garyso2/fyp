import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://iobnjmawpmtzsiojkauo.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlvYm5qbWF3cG10enNpb2prYXVvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk5MjMwOTksImV4cCI6MjA4NTQ5OTA5OX0.uV0rzfM2T-K3Z-0l7gPfBOKTqF6B4KCz0KnCHWOm-LI'

export const supabase = createClient(supabaseUrl, supabaseKey)
