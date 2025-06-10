import os
import requests
import json
from dotenv import load_dotenv
load_dotenv()
SLACK_TOKEN = os.getenv("SLACK_TOKEN")
headers = {"Authorization": f"Bearer {SLACK_TOKEN}"}
resp = requests.get("https://slack.com/api/users.list", headers=headers)

result = resp.json()
if result.get("ok") is not True:
    raise Exception(f"Error fetching users: {result.get('error', 'Unknown error')}")
users = result["members"]
people_list = []

output_dir = "public/people"
os.makedirs(output_dir, exist_ok=True)

print(f"Found {len(users)} users.")

for user in users:
    profile = user.get("profile", {})
    if not user.get("is_email_confirmed", False):
        continue
    if (user.get("is_restricted", False) or
        user.get("deleted", False) or
        user.get("is_bot", False) or
        not profile.get("real_name")):
        continue
    name = profile.get("real_name", "unknown")
    photo = profile.get("image_512")
    tz = user.get("tz")
    if not photo or not tz:
        continue
    print("Processing user:", profile.get("real_name", "unknown"))
    print(user["deleted"])
    filename = f"{name}.jpg"
    filepath = os.path.join(output_dir, filename)
    try:
        img_resp = requests.get(photo, timeout=10)
        img_resp.raise_for_status()
        with open(filepath, "wb") as f:
            f.write(img_resp.content)
        print(f"Downloaded {filename}")
        people_list.append({"name": name, "tz": tz})
    except Exception as e:
        print(f"Failed to download {photo}: {e}")

with open("people.json", "w") as f:
    json.dump(people_list, f, indent=2)
print("people.json written.")