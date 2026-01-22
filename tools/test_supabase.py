import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

def test_supabase():
    url = os.getenv("VITE_SUPABASE_URL")
    key = os.getenv("VITE_SUPABASE_ANON_KEY")
    
    if not url or not key:
        print("Missing Supabase URL or Key in .env")
        return

    try:
        supabase: Client = create_client(url, key)
        # Try to fetch something public (profiles)
        response = supabase.table("profiles").select("*").limit(1).execute()
        print("Success! Supabase Connection Verified.")
        print(f"Data: {response.data}")
    except Exception as e:
        print(f"Failed to connect: {str(e)}")

if __name__ == "__main__":
    test_supabase()
