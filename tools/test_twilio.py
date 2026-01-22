import os
from twilio.rest import Client
from dotenv import load_dotenv

load_dotenv()

def test_twilio():
    account_sid = os.getenv('TWILIO_ACCOUNT_SID')
    auth_token = os.getenv('TWILIO_AUTH_TOKEN')
    from_number = os.getenv('TWILIO_WHATSAPP_FROM')
    to_number = 'whatsapp:+27761963997' # User's test number

    client = Client(account_sid, auth_token)

    try:
        # Step Id: 53 - Testing with a simple message first to verify connection
        message = client.messages.create(
            from_=from_number,
            body='B.L.A.S.T. System Check: Twilio Link Verified!',
            to=to_number
        )
        print(f"Success! Message SID: {message.sid}")
    except Exception as e:
        print(f"Failed: {str(e)}")

if __name__ == "__main__":
    test_twilio()
