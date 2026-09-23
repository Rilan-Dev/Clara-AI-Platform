#!/bin/bash
# Analyze unique recoverable screenshots and classify against R1-R14 registry
OUT=/home/z/my-project/scripts/vlm-results
mkdir -p "$OUT"

PROMPT='Describe this screenshot concisely: what app screen is shown and its key UI elements. Then classify it as ONE of: (a) agent chat window / preview page with voice chat entry, (b) realtime voice agent session with orb/visualizer animation, (c) admin app with sidebar showing Agents section menus (Overview/Main/FAQ/Knowledge/Tools/Branches/Publish), (d) admin topbar with version chips next to profile avatar, (e) publish screen or version diff view, (f) profile popup with usage limits/plan meters, (g) billing/pricing/model settings page, (h) landing page/marketing, (i) other. Answer format: DESCRIPTION: <2-3 sentences> CLASS: <letter> <label>'

analyze() {
  local f="$1"; local name="$2"
  z-ai vision -p "$PROMPT" -i "$f" -o "$OUT/${name}.json" 2>&1 | tail -1
  echo "done: $name"
}

# Sep 20
analyze "/home/z/my-project/upload/pasted_image_1789869073247.png" "sep20_1789869073247" &
# Sep 21 morning - unique sizes
analyze "/home/z/my-project/upload/pasted_image_1789983394286.png" "sep21_1789983394286" &
analyze "/home/z/my-project/upload/pasted_image_1789983409291.png" "sep21_1789983409291" &
analyze "/home/z/my-project/upload/pasted_image_1789983445558.png" "sep21_76058_sample" &
analyze "/home/z/my-project/upload/pasted_image_1789983448061.png" "sep21_46165_sample" &
# Sep 21 midday
analyze "/home/z/my-project/upload/pasted_image_1789991062571.png" "sep21_1789991062571" &
analyze "/home/z/my-project/upload/pasted_image_1789991137182.png" "sep21_1789991137182" &
analyze "/home/z/my-project/upload/pasted_image_1789991219077.png" "sep21_1789991219077" &
wait
echo "ALL DONE"
