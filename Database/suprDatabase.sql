"""
SQL schema for Supr's database, defining tables for devices, users, activity logs, and device status.
"""
CREATE TABLE public.activity_logs (
  activity_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  device_id text NOT NULL,
  activity_type text NOT NULL,
  detected_content text,
  image_url text,
  time timestamp with time zone,
  CONSTRAINT activity_logs_pkey PRIMARY KEY (activity_id),
  CONSTRAINT activity_logs_device_id_fkey FOREIGN KEY (device_id) REFERENCES public.device(device_id)
);
CREATE TABLE public.device (
  device_id text NOT NULL,
  device_name text NOT NULL,
  language_setting text DEFAULT 'en'::text,
  CONSTRAINT device_pkey PRIMARY KEY (device_id)
);
CREATE TABLE public.device_status (
  device_id text NOT NULL,
  battery_level integer,
  is_online boolean DEFAULT false,
  last_updated timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT device_status_pkey PRIMARY KEY (device_id),
  CONSTRAINT device_status_device_id_fkey FOREIGN KEY (device_id) REFERENCES public.device(device_id)
);
CREATE TABLE public.user (
  user_id text NOT NULL,
  username text,
  password text,
  language text NOT NULL DEFAULT 'ENG'::text,
  CONSTRAINT user_pkey PRIMARY KEY (user_id)
);
CREATE TABLE public.user_device (
  device_id text NOT NULL,
  user_id text NOT NULL,
  CONSTRAINT user_device_pkey PRIMARY KEY (device_id, user_id),
  CONSTRAINT user_device_device_id_fkey FOREIGN KEY (device_id) REFERENCES public.device(device_id),
  CONSTRAINT user_device_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.user(user_id)
);