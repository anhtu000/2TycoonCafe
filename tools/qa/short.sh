#!/bin/sh
# Short runs on the test build (game clock x4): ad blocker, storage blocked, ads that never fill, rewarded x2, German.
U=http://127.0.0.1:8766/index.html
run() { name=$1; shift; rm -rf $name; mkdir -p $name; env "$@" python3 runbot.py $U $name 4 2.5 portrait > $name/log.txt 2>&1; echo "== $name"; tail -4 $name/log.txt; }
run s_adblock SDK_MODE=block
run s_storage STORAGE=blocked
run s_nofill SDK_MODE=none PREFER_REWARD=1
run s_reward PREFER_REWARD=1
run s_german LANG_SDK=de
name=s_landscape; rm -rf $name; mkdir -p $name; python3 runbot.py $U $name 4 2.5 landscape > $name/log.txt 2>&1; echo "== $name"; tail -4 $name/log.txt
