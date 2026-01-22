-- 1. Profiles (Extends Supabase Auth Users)
CREATE TABLE profiles (
    id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    role TEXT CHECK (role IN ('Admin', 'Doctor', 'Nail Artist', 'Provider')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Clients (Individual per User Profile)
CREATE TABLE clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Appointments
CREATE TABLE appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
    assigned_profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    scheduled_start TIMESTAMPTZ NOT NULL,
    duration_minutes INTEGER NOT NULL DEFAULT 30,
    actual_start TIMESTAMPTZ,
    actual_end TIMESTAMPTZ,
    delay_minutes INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'completed', 'shifted', 'noshow', 'cancelled')),
    shifted_from_id UUID REFERENCES profiles(id),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Breaks
CREATE TABLE breaks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    label TEXT DEFAULT 'Break',
    start_time TIME NOT NULL,
    duration_minutes INTEGER NOT NULL,
    day_of_week INTEGER CHECK (day_of_week BETWEEN 0 AND 6),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security (RLS) Rules
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE breaks ENABLE ROW LEVEL SECURITY;

-- Profiles: Users can read all (for shifting), but only update their own
CREATE POLICY "Public profiles are viewable by everyone." ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile." ON profiles FOR UPDATE USING (auth.uid() = id);

-- Clients: Only owner can see/edit
CREATE POLICY "Users can only see their own clients." ON clients FOR ALL USING (auth.uid() = owner_id);

-- Appointments: Owner can see, and Assigned user can see (for shifts)
CREATE POLICY "Users can see appointments where they are assigned or origin." 
ON appointments FOR ALL USING (auth.uid() = assigned_profile_id OR auth.uid() = shifted_from_id);

-- Breaks: Only owner can see/edit
CREATE POLICY "Users can only see their own breaks." ON breaks FOR ALL USING (auth.uid() = profile_id);
