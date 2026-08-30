#!/bin/sh
# brand/shots/ comes from the site; the banners are laid out over it.
set -e
node "$(dirname "$0")/mkshots.js"
node "$(dirname "$0")/mkbanners.js"
node "$(dirname "$0")/render.js"
