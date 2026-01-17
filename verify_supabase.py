from src.supabase_client import log_event, supabase
import time

def test_connection():
    print("Testing Supabase Connection...")
    if supabase:
        print("✅ Client initialized.")
        try:
            # Try to fetch count or just insert a test log
            print("Attempting to insert test log...")
            log_event(tracker_id=999, name="Test User", behavior="Testing", confidence=0.99)
            print("✅ Test log inserted successfully.")
            print("Please check your Supabase table 'classroom_events' for a row with name='Test User'.")
        except Exception as e:
            print(f"❌ Insertion failed: {e}")
    else:
        print("❌ Client is None. Check .env file.")

if __name__ == "__main__":
    test_connection()
