#!/usr/bin/env python3
"""
climo_build.py — ContextClimate Climographs dataset builder
=============================================================

WHAT THIS DOES
---------------
Regenerates the full climate-normals dataset that powers the Climographs
tool (climograph-tool.html). The tool ships with a starter dataset covering
11 cities (public/climo_data.json). This script rebuilds that same file for
ALL 372 resolvable US stations in STATIONS_ROSTER below, and additionally
populates the "record" columns the tool's tables already have slots for
(period-of-record daily temperature extremes and the single highest
calendar-month precipitation total on record) which the 1991-2020 NCEI
normals-monthly dataset alone does not carry.

For each station this script:
  1. Fetches 1991-2020 monthly climate normals from NOAA NCEI's Data Service
     API (dataset=normals-monthly) — one HTTP request per station (NOT
     batched; batching multiple station IDs per request was unreliable in
     testing).
  2. Fetches the station's full period-of-record daily maxt/mint/pcpn from
     the ACIS StnData API and reduces it client-side (in Python) into:
       - highest/lowest daily max temp observed in each calendar month
       - highest/lowest daily min temp observed in each calendar month
       - the highest calendar-month precipitation total ever recorded,
         and the year it occurred
     (ACIS server-side reduce/normal params were unreliable in testing, so
     raw daily rows are pulled and reduced here instead.)
  3. Merges both into the exact schema climo_data.json already uses, so the
     output is a drop-in replacement — same keys, same shape, just with all
     372 stations present and the record columns filled in.

The GHCN Daily station ID each ICAO airport maps to has already been
resolved (via ACIS StnMeta) and is embedded directly in STATIONS_ROSTER
below — this script does NOT re-derive it, it just reads the `ghcn` field.
One station, KMIN (Minot, ND), has no resolvable GHCN Daily crosswalk; it is
included in the roster with ghcn=None purely so the "skip unresolvable
station" path below is real and exercised, and is skipped with a printed
warning rather than crashing the run.

HOW TO RUN
----------
This script is meant to be run by a human with normal internet access (the
sandbox that originally built this tool does not have that). Requires
Python 3.8+ and the `requests` package:

    pip install requests
    python3 climo_build.py

Run it from the repository ROOT — it writes its output to the relative path
public/climo_data.json, which only resolves correctly from the repo root
(the same folder that already contains public/climograph-tool.html). Running
it from any other working directory will create public/ in the wrong place.

Once it finishes, public/climo_data.json is a complete drop-in replacement
for the starter file the tool currently ships with. Nothing in
climograph-tool.html needs to change — it fetches climo_data.json by
filename at runtime, so uploading the new file (in the same folder as the
HTML) is the entire deployment step.

A full run makes roughly 2 HTTP requests per station (~744 requests across
372 stations) with a polite delay between calls, so expect this to take
somewhere in the ballpark of 15-30 minutes depending on network conditions
and how many stations need a retry.

DEPENDENCIES
------------
Only `requests` (third-party) and the Python standard library. No other
packages.
"""

import json
import sys
import time
import os
from urllib.parse import urlencode

try:
    import requests
except ImportError:
    print("This script requires the 'requests' package. Install it with:\n"
          "    pip install requests", file=sys.stderr)
    sys.exit(1)

NCEI_BASE = "https://www.ncei.noaa.gov/access/services/data/v1"
ACIS_STNDATA_URL = "https://data.rcc-acis.org/StnData"
OUTPUT_PATH = os.path.join("public", "climo_data.json")

REQUEST_TIMEOUT = 30           # seconds
RATE_LIMIT_SLEEP = 0.3         # seconds between HTTP calls — be polite to free public APIs
RETRY_SLEEP = 1.5              # seconds to wait before a single retry attempt
HTTP_HEADERS = {"User-Agent": "ContextClimate climo_build.py (contextclimate.io)"}

# Sentinel values NOAA/ACIS use for "no data" in these APIs — must be
# converted to None, never passed through as a real number.
NCEI_MISSING_SENTINELS = {"-7777", "-9999", -7777, -9999}
ACIS_MISSING_FLAGS = {"M", "S", "", None}
ACIS_TRACE_FLAG = "T"

# ================================================================
# STATION ROSTER (373 entries — the full airport list Josh compiled, one
# per selected US city/state, copied verbatim from stations_meta.json, plus
# KMIN — see module docstring). Embedded as a JSON string and parsed with
# json.loads() below (rather than as a native Python literal) so there's no
# ambiguity between JSON's null/true/false and Python's None/True/False.
#
# `elev_ft` here is the corrected label: the upstream stations_meta.json
# field was literally named `elev_m` but its values are actually already in
# FEET (confirmed by cross-referencing known airport elevations, e.g. Denver
# = 5404 in that field, which matches Denver's real ~5430 ft elevation, not
# meters). KMIN has ghcn=null (=> None after parsing) — see module docstring.
# ================================================================
_STATIONS_ROSTER_JSON = r"""[{"icao":"PABE","ghcn":"USW00026615","name":"BETHEL AIRPORT","state":"AK","lat":60.78497,"lon":-161.82932,"elev_ft":107},{"icao":"PABR","ghcn":"USW00027502","name":"BARROW AIRPORT","state":"AK","lat":71.28703,"lon":-156.73938,"elev_ft":27},{"icao":"PADQ","ghcn":"USW00025501","name":"KODIAK AIRPORT","state":"AK","lat":57.75071,"lon":-152.4881,"elev_ft":16},{"icao":"PADU","ghcn":"USC00502587","name":"DUTCH HARBOR","state":"AK","lat":53.895,"lon":-166.5433,"elev_ft":10},{"icao":"PAEN","ghcn":"USW00026523","name":"KENAI AIRPORT","state":"AK","lat":60.57909,"lon":-151.24152,"elev_ft":99},{"icao":"PAFA","ghcn":"USW00026411","name":"FAIRBANKS INTL AP","state":"AK","lat":64.80309,"lon":-147.87605,"elev_ft":430},{"icao":"PAHO","ghcn":"USW00025507","name":"HOMER AIRPORT","state":"AK","lat":59.64196,"lon":-151.49098,"elev_ft":63},{"icao":"PAJN","ghcn":"USW00025309","name":"JUNEAU AIRPORT","state":"AK","lat":58.354,"lon":-134.55606,"elev_ft":19},{"icao":"PAKT","ghcn":"USW00025325","name":"KETCHIKAN AIRPORT","state":"AK","lat":55.3586,"lon":-131.72195,"elev_ft":84},{"icao":"PANC","ghcn":"USW00026451","name":"ANCHORAGE TED STEVENS INTERNATIONAL AIRPORT","state":"AK","lat":61.16916,"lon":-150.02771,"elev_ft":125},{"icao":"KBHM","ghcn":"USW00013876","name":"BIRMINGHAM AP","state":"AL","lat":33.56545,"lon":-86.7449,"elev_ft":616},{"icao":"KHSV","ghcn":"USW00003856","name":"HUNTSVILLE INTNL AP","state":"AL","lat":34.64406,"lon":-86.78615,"elev_ft":623},{"icao":"KMGM","ghcn":"USW00013895","name":"MONTGOMERY AP","state":"AL","lat":32.2997,"lon":-86.40745,"elev_ft":217},{"icao":"KMOB","ghcn":"USW00013894","name":"MOBILE REGIONAL AP","state":"AL","lat":30.68819,"lon":-88.24598,"elev_ft":215},{"icao":"KFSM","ghcn":"USW00013964","name":"FORT SMITH REGIONAL AP","state":"AR","lat":35.33346,"lon":-94.36526,"elev_ft":448},{"icao":"KFYV","ghcn":"USW00093993","name":"FAYETTEVILLE DRAKE FIELD","state":"AR","lat":36.01027,"lon":-94.16824,"elev_ft":1237},{"icao":"KHOT","ghcn":"USW00003962","name":"HOT SPRINGS ASOS","state":"AR","lat":34.47551,"lon":-93.10413,"elev_ft":505},{"icao":"KLIT","ghcn":"USW00013963","name":"LITTLE ROCK AP ADAMS FIELD","state":"AR","lat":34.72727,"lon":-92.2358,"elev_ft":251},{"icao":"KTXK","ghcn":"USW00013977","name":"TEXARKANA WEBB FIELD","state":"AR","lat":33.45606,"lon":-93.98777,"elev_ft":380},{"icao":"KXNA","ghcn":"USW00053922","name":"FAYETTEVILLE SPRINGDALE NW AR REGL AP","state":"AR","lat":36.28975,"lon":-94.31152,"elev_ft":1278},{"icao":"KFLG","ghcn":"USW00003103","name":"FLAGSTAFF AP","state":"AZ","lat":35.14427,"lon":-111.66637,"elev_ft":6999},{"icao":"KGCN","ghcn":"USW00003195","name":"GRAND CANYON NATIONAL PARK AP","state":"AZ","lat":35.94581,"lon":-112.15536,"elev_ft":6540},{"icao":"KIFP","ghcn":"USW00053135","name":"LAUGHLIN BULLHEAD INTL AP","state":"AZ","lat":35.15722,"lon":-114.55944,"elev_ft":695},{"icao":"KPHX","ghcn":"USW00023183","name":"PHOENIX AIRPORT","state":"AZ","lat":33.4278,"lon":-112.00365,"elev_ft":1113},{"icao":"KPRC","ghcn":"USW00023184","name":"PRESCOTT LOVE FIELD","state":"AZ","lat":34.64915,"lon":-112.42234,"elev_ft":5013},{"icao":"KSDL","ghcn":"USW00003192","name":"SCOTTSDALE MUNICIPAL AP","state":"AZ","lat":33.61234,"lon":-111.92317,"elev_ft":1431},{"icao":"KTUS","ghcn":"USW00023160","name":"TUCSON INTERNATIONAL AIRPORT","state":"AZ","lat":32.13153,"lon":-110.95638,"elev_ft":2551},{"icao":"KYUM","ghcn":"USW00023195","name":"YUMA INTL AP","state":"AZ","lat":32.66667,"lon":-114.6,"elev_ft":206},{"icao":"KACV","ghcn":"USW00024283","name":"ARCATA EUREKA AP","state":"CA","lat":40.97844,"lon":-124.10479,"elev_ft":211},{"icao":"KBFL","ghcn":"USW00023155","name":"BAKERSFIELD AP","state":"CA","lat":35.43424,"lon":-119.05524,"elev_ft":490},{"icao":"KBUR","ghcn":"USW00023152","name":"BURBANK GLENDALE PASADENA AP","state":"CA","lat":34.19966,"lon":-118.36543,"elev_ft":731},{"icao":"KCIC","ghcn":"USW00093203","name":"CHICO ARMY FLYING SCH","state":"CA","lat":39.8,"lon":-121.85,"elev_ft":272},{"icao":"KCRQ","ghcn":"USW00003177","name":"CARLSBAD MCCLELLAN PALOMAR AP","state":"CA","lat":33.12993,"lon":-117.27651,"elev_ft":313},{"icao":"KFAT","ghcn":"USW00093193","name":"FRESNO YOSEMITE INT'L","state":"CA","lat":36.77999,"lon":-119.72016,"elev_ft":334},{"icao":"KLAX","ghcn":"USW00023174","name":"LOS ANGELES INTL AP","state":"CA","lat":33.93816,"lon":-118.3866,"elev_ft":97},{"icao":"KLGB","ghcn":"USW00023129","name":"LONG BEACH DAUGHERTY AP","state":"CA","lat":33.81177,"lon":-118.14718,"elev_ft":34},{"icao":"KMRY","ghcn":"USW00023259","name":"MONTEREY PENINSUL AP","state":"CA","lat":36.59041,"lon":-121.84881,"elev_ft":160},{"icao":"KOAK","ghcn":"USW00023230","name":"OAKLAND INTERNATIONAL AIRPORT","state":"CA","lat":37.7178,"lon":-122.23301,"elev_ft":5},{"icao":"KONT","ghcn":"USW00003102","name":"ONTARIO INTL AP","state":"CA","lat":34.05314,"lon":-117.57689,"elev_ft":924},{"icao":"KPSP","ghcn":"USW00093138","name":"PALM SPRINGS ASOS","state":"CA","lat":33.82216,"lon":-116.50433,"elev_ft":409},{"icao":"KRDD","ghcn":"USW00024257","name":"REDDING AP","state":"CA","lat":40.51462,"lon":-122.29773,"elev_ft":501},{"icao":"KSAN","ghcn":"USW00023188","name":"SAN DIEGO INTERNATIONAL AP","state":"CA","lat":32.7336,"lon":-117.1831,"elev_ft":15},{"icao":"KSBA","ghcn":"USW00023190","name":"SANTA BARBARA MUNI AP","state":"CA","lat":34.4241,"lon":-119.84249,"elev_ft":8},{"icao":"KSFO","ghcn":"USW00023234","name":"SAN FRANCISCO INTERNATIONAL AP","state":"CA","lat":37.61962,"lon":-122.36562,"elev_ft":10},{"icao":"KSJC","ghcn":"USW00023293","name":"SAN JOSE","state":"CA","lat":37.35938,"lon":-121.92444,"elev_ft":49},{"icao":"KSMF","ghcn":"USW00093225","name":"SACRAMENTO METROPOLITAN AP","state":"CA","lat":38.70069,"lon":-121.59479,"elev_ft":24},{"icao":"KSNA","ghcn":"USW00093184","name":"SANTA ANA JOHN WAYNE AP","state":"CA","lat":33.67975,"lon":-117.86746,"elev_ft":43},{"icao":"KSTS","ghcn":"USW00023213","name":"SANTA ROSA SONOMA CO AP","state":"CA","lat":38.50369,"lon":-122.81101,"elev_ft":119},{"icao":"KALS","ghcn":"USW00023061","name":"ALAMOSA-BERGMAN FIELD","state":"CO","lat":37.43931,"lon":-105.8618,"elev_ft":7537},{"icao":"KASE","ghcn":"USW00093073","name":"ASPEN PITKIN COUNTY AP SARDY FIELD","state":"CO","lat":39.22994,"lon":-106.87052,"elev_ft":7677},{"icao":"KCOS","ghcn":"USW00093037","name":"COLORADO SPRINGS MUNICIPAL AP","state":"CO","lat":38.80949,"lon":-104.68873,"elev_ft":6182},{"icao":"KDEN","ghcn":"USW00003017","name":"DENVER INTL AP","state":"CO","lat":39.84657,"lon":-104.65623,"elev_ft":5404},{"icao":"KEGE","ghcn":"USW00023063","name":"EAGLE COUNTY AP","state":"CO","lat":39.65,"lon":-106.91667,"elev_ft":6497},{"icao":"KGJT","ghcn":"USW00023066","name":"GRAND JUNCTION WALKER FIELD","state":"CO","lat":39.13437,"lon":-108.54081,"elev_ft":4824},{"icao":"KMTJ","ghcn":"USW00093013","name":"MONTROSE REGIONAL AP","state":"CO","lat":38.50538,"lon":-107.89813,"elev_ft":5707},{"icao":"KPUB","ghcn":"USW00093058","name":"PUEBLO MEMORIAL AIRPORT","state":"CO","lat":38.28868,"lon":-104.5057,"elev_ft":4674},{"icao":"KBDL","ghcn":"USW00014740","name":"HARTFORD-BRADLEY INTERNATIONAL AIRPORT","state":"CT","lat":41.93742,"lon":-72.68202,"elev_ft":169},{"icao":"KBDR","ghcn":"USW00094702","name":"IGOR I SIKORSKY MEMORIAL AIRPORT","state":"CT","lat":41.16424,"lon":-73.12664,"elev_ft":6},{"icao":"KDXR","ghcn":"USW00054734","name":"DANBURY MUNICIPAL AP","state":"CT","lat":41.37215,"lon":-73.48337,"elev_ft":453},{"icao":"KGON","ghcn":"USW00014707","name":"GROTON NEW LONDON AP","state":"CT","lat":41.32792,"lon":-72.04893,"elev_ft":8},{"icao":"KHFD","ghcn":"USW00014752","name":"HARTFORD-BRAINARD AIRPORT","state":"CT","lat":41.7352,"lon":-72.65115,"elev_ft":13},{"icao":"KHVN","ghcn":"USW00014758","name":"NEW HAVEN TWEED AP","state":"CT","lat":41.259,"lon":-72.88911,"elev_ft":6},{"icao":"KDOV","ghcn":"USW00013707","name":"DOVER AFB","state":"DE","lat":39.13333,"lon":-75.46667,"elev_ft":28},{"icao":"KGED","ghcn":"USW00013764","name":"GEORGETOWN-DELAWARE COASTAL AIRPORT","state":"DE","lat":38.68974,"lon":-75.36246,"elev_ft":50},{"icao":"KILG","ghcn":"USW00013781","name":"WILMINGTON AIRPORT","state":"DE","lat":39.67444,"lon":-75.60566,"elev_ft":74},{"icao":"KEYW","ghcn":"USW00012836","name":"KEY WEST INTL AIRPORT","state":"FL","lat":24.55706,"lon":-81.75539,"elev_ft":1},{"icao":"KFLL","ghcn":"USW00012849","name":"FORT LAUDERDALE INTERNATIONAL AIRPORT","state":"FL","lat":26.07875,"lon":-80.16223,"elev_ft":3},{"icao":"KGNV","ghcn":"USW00012816","name":"GAINESVILLE REGIONAL AP","state":"FL","lat":29.6917,"lon":-82.27603,"elev_ft":133},{"icao":"KJAX","ghcn":"USW00013889","name":"JACKSONVILLE INTL AP","state":"FL","lat":30.49529,"lon":-81.69374,"elev_ft":24},{"icao":"KMCO","ghcn":"USW00012815","name":"ORLANDO INTL AP","state":"FL","lat":28.41822,"lon":-81.32413,"elev_ft":89},{"icao":"KMIA","ghcn":"USW00012839","name":"MIAMI INTERNATIONAL AP","state":"FL","lat":25.78805,"lon":-80.31694,"elev_ft":5},{"icao":"KPNS","ghcn":"USW00013899","name":"PENSACOLA REGIONAL AP","state":"FL","lat":30.47612,"lon":-87.18575,"elev_ft":118},{"icao":"KRSW","ghcn":"USW00012894","name":"FORT MYERS SW FLORIDA REGIONAL AP","state":"FL","lat":26.53805,"lon":-81.75674,"elev_ft":27},{"icao":"KTLH","ghcn":"USW00093805","name":"TALLAHASSEE REGIONAL AP","state":"FL","lat":30.39354,"lon":-84.35136,"elev_ft":56},{"icao":"KTPA","ghcn":"USW00012842","name":"TAMPA INTL AP","state":"FL","lat":27.96331,"lon":-82.54,"elev_ft":6},{"icao":"KAGS","ghcn":"USW00003820","name":"AUGUSTA BUSH FIELD AP","state":"GA","lat":33.36517,"lon":-81.96353,"elev_ft":134},{"icao":"KATL","ghcn":"USW00013874","name":"ATLANTA HARTSFIELD-JACKSON INTERNATIONAL AIRPORT","state":"GA","lat":33.62972,"lon":-84.44224,"elev_ft":1011},{"icao":"KCSG","ghcn":"USW00093842","name":"COLUMBUS METROPOLITAN AP","state":"GA","lat":32.51625,"lon":-84.94218,"elev_ft":394},{"icao":"KSAV","ghcn":"USW00003822","name":"SAVANNAH/HILTON HEAD INTL AIRPORT","state":"GA","lat":32.13133,"lon":-81.2023,"elev_ft":29},{"icao":"KVLD","ghcn":"USW00093845","name":"VALDOSTA REGIONAL AP","state":"GA","lat":30.77629,"lon":-83.27393,"elev_ft":193},{"icao":"PHKO","ghcn":"USW00021510","name":"KAILUA KONA KE-AHOLE AP","state":"HI","lat":19.73782,"lon":-156.04794,"elev_ft":37},{"icao":"PHNL","ghcn":"USW00022521","name":"HONOLULU INTL AP","state":"HI","lat":21.32402,"lon":-157.93945,"elev_ft":6},{"icao":"PHOG","ghcn":"USW00022516","name":"KAHULUI AP","state":"HI","lat":20.88871,"lon":-156.43452,"elev_ft":46},{"icao":"PHTO","ghcn":"USW00021504","name":"HILO INTERNATIONAL AP 87","state":"HI","lat":19.71909,"lon":-155.04897,"elev_ft":29},{"icao":"KALO","ghcn":"USW00094910","name":"WATERLOO MUNICIPAL AP","state":"IA","lat":42.55437,"lon":-92.40131,"elev_ft":867},{"icao":"KCID","ghcn":"USW00014990","name":"CEDAR RAPIDS MUNICIPAL AP","state":"IA","lat":41.88292,"lon":-91.72459,"elev_ft":840},{"icao":"KDBQ","ghcn":"USW00094908","name":"DUBUQUE REGIONAL AP","state":"IA","lat":42.39834,"lon":-90.70913,"elev_ft":1040},{"icao":"KDSM","ghcn":"USW00014933","name":"DES MOINES INTL AP","state":"IA","lat":41.53395,"lon":-93.65313,"elev_ft":939},{"icao":"KDVN","ghcn":"USW00094982","name":"DAVENPORT MUNICIPAL AP","state":"IA","lat":41.61334,"lon":-90.59484,"elev_ft":746},{"icao":"KSUX","ghcn":"USW00014943","name":"SIOUX CITY AP","state":"IA","lat":42.39169,"lon":-96.37948,"elev_ft":1092},{"icao":"KBOI","ghcn":"USW00024131","name":"BOISE AIR TERMINAL","state":"ID","lat":43.56705,"lon":-116.24062,"elev_ft":2823},{"icao":"KCOE","ghcn":"USW00024136","name":"COEUR D ALENE AIR TERMINAL","state":"ID","lat":47.76667,"lon":-116.81667,"elev_ft":2307},{"icao":"KIDA","ghcn":"USW00024145","name":"IDAHO FALLS FAA AP","state":"ID","lat":43.52044,"lon":-112.06753,"elev_ft":4733},{"icao":"KLWS","ghcn":"USW00024149","name":"LEWISTON AP","state":"ID","lat":46.37458,"lon":-117.01529,"elev_ft":1430},{"icao":"KMUO","ghcn":"USW00024106","name":"MOUNTAIN HOME AFB","state":"ID","lat":43.05,"lon":-115.86667,"elev_ft":2996},{"icao":"KMYL","ghcn":"USW00094182","name":"MCCALL AP","state":"ID","lat":44.89425,"lon":-116.09978,"elev_ft":5023},{"icao":"KPIH","ghcn":"USW00024156","name":"POCATELLO REGIONAL AIRPORT","state":"ID","lat":42.91969,"lon":-112.57232,"elev_ft":4451},{"icao":"KSUN","ghcn":"USC00103942","name":"HAILEY FRIEDMAN MEMORIAL AP","state":"ID","lat":43.5,"lon":-114.3,"elev_ft":5306},{"icao":"KTWF","ghcn":"USW00094178","name":"TWIN FALLS SUN VALLEY REGIONAL AP","state":"ID","lat":42.47849,"lon":-114.47744,"elev_ft":4166},{"icao":"KBMI","ghcn":"USW00054831","name":"BLOOMINGTON NORMAL AP","state":"IL","lat":40.48333,"lon":-88.95,"elev_ft":865},{"icao":"KCMI","ghcn":"USW00094870","name":"CHAMPAIGN URBANA WILLARD AP","state":"IL","lat":40.0324,"lon":-88.27547,"elev_ft":743},{"icao":"KDEC","ghcn":"USW00003887","name":"DECATUR AP","state":"IL","lat":39.83079,"lon":-88.87192,"elev_ft":673},{"icao":"KMDW","ghcn":"USW00014819","name":"CHICAGO MIDWAY AP","state":"IL","lat":41.78412,"lon":-87.75514,"elev_ft":610},{"icao":"KMLI","ghcn":"USW00014923","name":"MOLINE QUAD CITY INTL AP","state":"IL","lat":41.44816,"lon":-90.52365,"elev_ft":576},{"icao":"KORD","ghcn":"USW00094846","name":"CHICAGO OHARE INTL AP","state":"IL","lat":41.96017,"lon":-87.93164,"elev_ft":672},{"icao":"KPIA","ghcn":"USW00014842","name":"GENERAL WAYNE A. DOWNING INTERNATIONAL AP","state":"IL","lat":40.66747,"lon":-89.68418,"elev_ft":655},{"icao":"KRFD","ghcn":"USW00094822","name":"ROCKFORD GREATER ROCKFORD AP","state":"IL","lat":42.19325,"lon":-89.09335,"elev_ft":725},{"icao":"KSPI","ghcn":"USW00093822","name":"SPRINGFIELD ABRAHAM LINCOLN CAPITAL AP","state":"IL","lat":39.84529,"lon":-89.68401,"elev_ft":590},{"icao":"KEVV","ghcn":"USW00093817","name":"EVANSVILLE REGIONAL AP","state":"IN","lat":38.05015,"lon":-87.51465,"elev_ft":402},{"icao":"KFWA","ghcn":"USW00014827","name":"FORT WAYNE INTL AP","state":"IN","lat":40.97248,"lon":-85.20636,"elev_ft":797},{"icao":"KHUF","ghcn":"USW00003868","name":"TERRE HAUTE HULMAN REGIONAL AP","state":"IN","lat":39.4429,"lon":-87.32206,"elev_ft":567},{"icao":"KIND","ghcn":"USW00093819","name":"INDIANAPOLIS INTL AP","state":"IN","lat":39.72515,"lon":-86.2816,"elev_ft":792},{"icao":"KMIE","ghcn":"USW00094895","name":"MUNCIE DELAWARE COUNTY AP","state":"IN","lat":40.23451,"lon":-85.39356,"elev_ft":936},{"icao":"KSBN","ghcn":"USW00014848","name":"SOUTH BEND AP","state":"IN","lat":41.70722,"lon":-86.31628,"elev_ft":772},{"icao":"KDDC","ghcn":"USW00013985","name":"DODGE CITY REGIONAL AP","state":"KS","lat":37.77105,"lon":-99.96915,"elev_ft":2577},{"icao":"KGCK","ghcn":"USW00023064","name":"GARDEN CITY REGIONAL AP","state":"KS","lat":37.92208,"lon":-100.72428,"elev_ft":2878},{"icao":"KICT","ghcn":"USW00003928","name":"WICHITA DWIGHT D. EISENHOWER NATIONAL AIRPORT","state":"KS","lat":37.64753,"lon":-97.42999,"elev_ft":1318},{"icao":"KMHK","ghcn":"USW00003936","name":"MANHATTAN ASOS","state":"KS","lat":39.13456,"lon":-96.67894,"elev_ft":1048},{"icao":"KSLN","ghcn":"USW00003919","name":"SALINA MUNICIPAL AP","state":"KS","lat":38.77996,"lon":-97.64444,"elev_ft":1263},{"icao":"KTOP","ghcn":"USW00013996","name":"TOPEKA ASOS","state":"KS","lat":39.07246,"lon":-95.62602,"elev_ft":880},{"icao":"KCVG","ghcn":"USW00093814","name":"CINCINNATI/NORTHERN KENTUCKY INTERNATIONAL AIRPORT","state":"KY","lat":39.04443,"lon":-84.67241,"elev_ft":861},{"icao":"KFFT","ghcn":"USW00053841","name":"FRANKFORT CAPITAL CITY AP","state":"KY","lat":38.18463,"lon":-84.90393,"elev_ft":777},{"icao":"KHOP","ghcn":"USW00013806","name":"FORT CAMPBELL AAF","state":"KY","lat":36.66667,"lon":-87.48333,"elev_ft":573},{"icao":"KLEX","ghcn":"USW00093820","name":"LEXINGTON BLUEGRASS AP","state":"KY","lat":38.03391,"lon":-84.61138,"elev_ft":962},{"icao":"KPAH","ghcn":"USW00003816","name":"PADUCAH BARKLEY REGIONAL AP","state":"KY","lat":37.05635,"lon":-88.77425,"elev_ft":407},{"icao":"KSDF","ghcn":"USW00093821","name":"LOUISVILLE INTL AP","state":"KY","lat":38.17738,"lon":-85.73077,"elev_ft":480},{"icao":"KAEX","ghcn":"USW00093915","name":"ALEXANDRIA INTL AP","state":"LA","lat":31.33464,"lon":-92.55849,"elev_ft":82},{"icao":"KBTR","ghcn":"USW00013970","name":"BATON ROUGE METRO AP","state":"LA","lat":30.53782,"lon":-91.14681,"elev_ft":67},{"icao":"KLCH","ghcn":"USW00003937","name":"LAKE CHARLES REGIONAL AP","state":"LA","lat":30.12551,"lon":-93.22771,"elev_ft":7},{"icao":"KLFT","ghcn":"USW00013976","name":"LAFAYETTE REGIONAL AP","state":"LA","lat":30.19859,"lon":-91.98957,"elev_ft":35},{"icao":"KMLU","ghcn":"USW00013942","name":"MONROE REGIONAL AP","state":"LA","lat":32.51552,"lon":-92.02995,"elev_ft":73},{"icao":"KMSY","ghcn":"USW00012916","name":"NEW ORLEANS AP","state":"LA","lat":29.99755,"lon":-90.27772,"elev_ft":-3},{"icao":"KSHV","ghcn":"USW00013957","name":"SHREVEPORT AP","state":"LA","lat":32.4473,"lon":-93.8244,"elev_ft":228},{"icao":"KACK","ghcn":"USW00014756","name":"NANTUCKET MEMORIAL AP","state":"MA","lat":41.25407,"lon":-70.05893,"elev_ft":37},{"icao":"KBED","ghcn":"USW00014702","name":"BEDFORD HANSCOM FIELD","state":"MA","lat":42.46811,"lon":-71.29463,"elev_ft":128},{"icao":"KBOS","ghcn":"USW00014739","name":"BOSTON LOGAN INTERNATIONAL AIRPORT","state":"MA","lat":42.36057,"lon":-71.00975,"elev_ft":11},{"icao":"KEWB","ghcn":"USW00094726","name":"NEW BEDFORD MUNICIPAL AP","state":"MA","lat":41.67908,"lon":-70.95911,"elev_ft":74},{"icao":"KHYA","ghcn":"USW00094720","name":"HYANNIS BARNSTABLE MUNICIPAL AP","state":"MA","lat":41.6719,"lon":-70.26972,"elev_ft":37},{"icao":"KMVY","ghcn":"USW00094724","name":"VINEYARD HAVEN MARTHAS VINEYARD AP","state":"MA","lat":41.39296,"lon":-70.61592,"elev_ft":59},{"icao":"KORH","ghcn":"USW00094746","name":"WORCESTER REGIONAL AIRPORT","state":"MA","lat":42.2706,"lon":-71.8731,"elev_ft":1002},{"icao":"KADW","ghcn":"USW00013705","name":"CAMP SPRINGS ANDREWS AFB","state":"MD","lat":38.81667,"lon":-76.86667,"elev_ft":282},{"icao":"KBWI","ghcn":"USW00093721","name":"BALTIMORE-WASHINGTON INTERNATIONAL AIRPORT","state":"MD","lat":39.17329,"lon":-76.68408,"elev_ft":138},{"icao":"KHGR","ghcn":"USW00093706","name":"HAGERSTOWN REGIONAL AIRPORT","state":"MD","lat":39.70618,"lon":-77.73037,"elev_ft":687},{"icao":"KSBY","ghcn":"USW00093720","name":"SALISBURY-WICOMICO REGIONAL AIRPORT","state":"MD","lat":38.3409,"lon":-75.51324,"elev_ft":47},{"icao":"KAUG","ghcn":"USW00014605","name":"AUGUSTA STATE AIRPORT","state":"ME","lat":44.3161,"lon":-69.79702,"elev_ft":349},{"icao":"KBGR","ghcn":"USW00014606","name":"BANGOR INTERNATIONAL AIRPORT","state":"ME","lat":44.79791,"lon":-68.81852,"elev_ft":147},{"icao":"KBHB","ghcn":"USW00014616","name":"BAR HARBOR AP","state":"ME","lat":44.45,"lon":-68.36667,"elev_ft":88},{"icao":"KCAR","ghcn":"USW00014607","name":"CARIBOU WFO","state":"ME","lat":46.87049,"lon":-68.01723,"elev_ft":619},{"icao":"KLEW","ghcn":"USW00094709","name":"AUBURN LEWISTON","state":"ME","lat":44.05,"lon":-70.28333,"elev_ft":288},{"icao":"KPQI","ghcn":"USW00014604","name":"PRESQUE ISLE MUNICIPAL AP","state":"ME","lat":46.68333,"lon":-68.05,"elev_ft":534},{"icao":"KPWM","ghcn":"USW00014764","name":"PORTLAND JETPORT","state":"ME","lat":43.64244,"lon":-70.30443,"elev_ft":44},{"icao":"KRKD","ghcn":"USW00094601","name":"ROCKLAND KNOX COUNTY REGIONAL AP","state":"ME","lat":44.06667,"lon":-69.1,"elev_ft":47},{"icao":"KAPN","ghcn":"USW00094849","name":"ALPENA COUNTY REGIONAL AP","state":"MI","lat":45.0716,"lon":-83.56451,"elev_ft":683},{"icao":"KDTW","ghcn":"USW00094847","name":"DETROIT METRO AIRPORT","state":"MI","lat":42.23113,"lon":-83.33121,"elev_ft":630},{"icao":"KFNT","ghcn":"USW00014826","name":"FLINT FCWOS","state":"MI","lat":42.96684,"lon":-83.74996,"elev_ft":770},{"icao":"KGRR","ghcn":"USW00094860","name":"GRAND RAPIDS GERALD R FORD INTL AP","state":"MI","lat":42.8821,"lon":-85.52297,"elev_ft":788},{"icao":"KLAN","ghcn":"USW00014836","name":"LANSING CAPITAL CITY AP","state":"MI","lat":42.77609,"lon":-84.59972,"elev_ft":857},{"icao":"KMBS","ghcn":"USW00014845","name":"SAGINAW MBS INTL AP","state":"MI","lat":43.52808,"lon":-84.08133,"elev_ft":662},{"icao":"KSAW","ghcn":"USW00094836","name":"GWINN K I SAWYER AFB","state":"MI","lat":46.35,"lon":-87.4,"elev_ft":1221},{"icao":"KTVC","ghcn":"USW00014850","name":"TRAVERSE CITY CHERRY CAPITAL AP","state":"MI","lat":44.73895,"lon":-85.5679,"elev_ft":608},{"icao":"KBJI","ghcn":"USC00210643","name":"BEMIDJI MUNICIPAL AP","state":"MN","lat":47.5,"lon":-94.93333,"elev_ft":1392},{"icao":"KDLH","ghcn":"USW00014913","name":"DULUTH INTL AP","state":"MN","lat":46.8436,"lon":-92.18658,"elev_ft":1422},{"icao":"KHIB","ghcn":"USW00094931","name":"HIBBING CHISHOLM HIBBING AP","state":"MN","lat":47.38039,"lon":-92.83246,"elev_ft":1339},{"icao":"KMSP","ghcn":"USW00014922","name":"MINNEAPOLIS-ST. PAUL INTERNATIONAL AIRPORT","state":"MN","lat":44.88523,"lon":-93.23133,"elev_ft":835},{"icao":"KRST","ghcn":"USW00014925","name":"ROCHESTER INTERNATIONAL AIRPORT","state":"MN","lat":43.904,"lon":-92.49207,"elev_ft":1306},{"icao":"KSTC","ghcn":"USW00014926","name":"ST. CLOUD REGIONAL AIRPORT","state":"MN","lat":45.54416,"lon":-94.0516,"elev_ft":1018},{"icao":"KSTP","ghcn":"USW00014927","name":"ST. PAUL DOWNTOWN AIRPORT","state":"MN","lat":44.93234,"lon":-93.05586,"elev_ft":700},{"icao":"KCOU","ghcn":"USW00003945","name":"COLUMBIA REGIONAL AIRPORT","state":"MO","lat":38.81704,"lon":-92.21475,"elev_ft":893},{"icao":"KJLN","ghcn":"USW00013987","name":"JOPLIN REGIONAL AIRPORT","state":"MO","lat":37.15222,"lon":-94.49524,"elev_ft":972},{"icao":"KMCI","ghcn":"USW00003947","name":"KANSAS CITY INTL AP","state":"MO","lat":39.29747,"lon":-94.73087,"elev_ft":1008},{"icao":"KSGF","ghcn":"USW00013995","name":"SPRINGFIELD WSO AP","state":"MO","lat":37.23983,"lon":-93.38995,"elev_ft":1262},{"icao":"KSTJ","ghcn":"USW00013993","name":"ST JOSEPH ROSECRANS MEMORIAL AP","state":"MO","lat":39.76829,"lon":-94.90953,"elev_ft":807},{"icao":"KSTL","ghcn":"USW00013994","name":"ST LOUIS LAMBERT INTL AIRPORT","state":"MO","lat":38.75246,"lon":-90.37342,"elev_ft":531},{"icao":"KBIX","ghcn":"USW00013820","name":"BILOXI KEESLER AFB","state":"MS","lat":30.41667,"lon":-88.91667,"elev_ft":33},{"icao":"KGPT","ghcn":"USW00093874","name":"GULFPORT - BILOXI AIRPORT","state":"MS","lat":30.4121,"lon":-89.08093,"elev_ft":16},{"icao":"KHBG","ghcn":"USW00013833","name":"HATTIESBURG CHAIN MUNICIPAL AP","state":"MS","lat":31.26951,"lon":-89.25609,"elev_ft":147},{"icao":"KJAN","ghcn":"USW00003940","name":"JACKSON INTL AP","state":"MS","lat":32.31982,"lon":-90.07778,"elev_ft":296},{"icao":"KMEI","ghcn":"USW00013865","name":"MERIDIAN KEY FIELD","state":"MS","lat":32.33483,"lon":-88.75073,"elev_ft":289},{"icao":"KTUP","ghcn":"USW00093862","name":"TUPELO REGIONAL AP","state":"MS","lat":34.26224,"lon":-88.77127,"elev_ft":340},{"icao":"KBIL","ghcn":"USW00024033","name":"BILLINGS INTERNATIONAL AIRPORT","state":"MT","lat":45.80721,"lon":-108.54618,"elev_ft":3590},{"icao":"KBTM","ghcn":"USW00024135","name":"BUTTE BERT MOONEY AP","state":"MT","lat":45.96436,"lon":-112.50147,"elev_ft":5505},{"icao":"KBZN","ghcn":"USW00024132","name":"BOZEMAN GALLATIN FIELD AP","state":"MT","lat":45.78759,"lon":-111.16152,"elev_ft":4431},{"icao":"KGGW","ghcn":"USW00094008","name":"GLASGOW INTERNATIONAL AP","state":"MT","lat":48.21416,"lon":-106.62139,"elev_ft":2289},{"icao":"KGTF","ghcn":"USW00024143","name":"GREAT FALLS AIRPORT","state":"MT","lat":47.47327,"lon":-111.38281,"elev_ft":3667},{"icao":"KHLN","ghcn":"USW00024144","name":"HELENA AIRPORT ASOS","state":"MT","lat":46.60444,"lon":-111.98921,"elev_ft":3865},{"icao":"KHVR","ghcn":"USW00094012","name":"HAVRE AP ASOS","state":"MT","lat":48.54254,"lon":-109.76439,"elev_ft":2586},{"icao":"KLWT","ghcn":"USW00024036","name":"LEWISTOWN AP","state":"MT","lat":47.05443,"lon":-109.45654,"elev_ft":4125},{"icao":"KMLS","ghcn":"USW00024037","name":"MILES CITY AIRPORT","state":"MT","lat":46.42647,"lon":-105.88333,"elev_ft":2625},{"icao":"KMSO","ghcn":"USW00024153","name":"MISSOULA INTERNATIONAL AP","state":"MT","lat":46.92076,"lon":-114.09376,"elev_ft":3195},{"icao":"KSDY","ghcn":"USW00094028","name":"SIDNEY RICHLAND MUNICIPAL AP","state":"MT","lat":47.71667,"lon":-104.18333,"elev_ft":1980},{"icao":"KAVL","ghcn":"USW00003812","name":"ASHEVILLE REGIONAL AIRPORT","state":"NC","lat":35.43178,"lon":-82.53787,"elev_ft":2118},{"icao":"KCLT","ghcn":"USW00013881","name":"CHARLOTTE DOUGLAS AIRPORT","state":"NC","lat":35.22254,"lon":-80.95433,"elev_ft":730},{"icao":"KEWN","ghcn":"USW00093719","name":"NEW BERN - COASTAL CAROLINA REGIONAL AIRPORT","state":"NC","lat":35.06836,"lon":-77.04783,"elev_ft":11},{"icao":"KFAY","ghcn":"USW00093740","name":"FAYETTEVILLE REGIONAL AP GRANNIS FIELD","state":"NC","lat":34.98953,"lon":-78.88004,"elev_ft":186},{"icao":"KFBG","ghcn":"USW00093737","name":"FORT BRAGG SIMMONS AAF","state":"NC","lat":35.13333,"lon":-78.93333,"elev_ft":244},{"icao":"KGSO","ghcn":"USW00013723","name":"GREENSBORO/PIEDMONT TRIAD INTERNATIONAL AIRPORT","state":"NC","lat":36.0969,"lon":-79.94316,"elev_ft":902},{"icao":"KILM","ghcn":"USW00013748","name":"WILMINGTON INT'L AIRPORT","state":"NC","lat":34.26678,"lon":-77.89987,"elev_ft":23},{"icao":"KRDU","ghcn":"USW00013722","name":"RALEIGH-DURHAM INTERNATIONAL AIRPORT","state":"NC","lat":35.89227,"lon":-78.78194,"elev_ft":395},{"icao":"KBIS","ghcn":"USW00024011","name":"BISMARCK MUNICIPAL AP","state":"ND","lat":46.78232,"lon":-100.75752,"elev_ft":1651},{"icao":"KDIK","ghcn":"USW00024012","name":"DICKINSON THEODORE ROOSEVELT REGIONAL AIRPORT","state":"ND","lat":46.79968,"lon":-102.79715,"elev_ft":2583},{"icao":"KFAR","ghcn":"USW00014914","name":"FARGO HECTOR INTL AP","state":"ND","lat":46.92424,"lon":-96.81186,"elev_ft":895},{"icao":"KGFK","ghcn":"USW00014916","name":"GRAND FORKS INTL AP","state":"ND","lat":47.94281,"lon":-97.18294,"elev_ft":838},{"icao":"KMIN","ghcn":null,"name":"MINOT INTL","state":"ND","lat":48.414,"lon":-101.358,"elev_ft":null},{"icao":"KMOT","ghcn":"USW00024013","name":"MINOT INTL AP","state":"ND","lat":48.25203,"lon":-101.26891,"elev_ft":1657},{"icao":"KBFF","ghcn":"USW00024028","name":"SCOTTSBLUFF W B HEILIG FIELD AP","state":"NE","lat":41.87466,"lon":-103.60112,"elev_ft":3957},{"icao":"KEAR","ghcn":"USW00014905","name":"KEARNEY MUNICIPAL AP","state":"NE","lat":40.73333,"lon":-99.0,"elev_ft":2130},{"icao":"KGRI","ghcn":"USW00014935","name":"GRAND ISLAND CENTRAL NE REGIONAL AP","state":"NE","lat":40.96146,"lon":-98.31304,"elev_ft":1843},{"icao":"KLBF","ghcn":"USW00024023","name":"NORTH PLATTE REGIONAL AP","state":"NE","lat":41.12199,"lon":-100.66895,"elev_ft":2762},{"icao":"KLNK","ghcn":"USW00014939","name":"LINCOLN AIRPORT","state":"NE","lat":40.84781,"lon":-96.76467,"elev_ft":1170},{"icao":"KOFF","ghcn":"USW00014949","name":"BELLEVUE OFFUTT AFB","state":"NE","lat":41.11667,"lon":-95.91667,"elev_ft":1047},{"icao":"KOMA","ghcn":"USW00014942","name":"OMAHA EPPLEY AIRFIELD","state":"NE","lat":41.31186,"lon":-95.90186,"elev_ft":980},{"icao":"KASH","ghcn":"USW00054754","name":"NASHUA BOIRE FIELD","state":"NH","lat":42.78333,"lon":-71.51667,"elev_ft":200},{"icao":"KCON","ghcn":"USW00014745","name":"CONCORD MUNICIPAL AIRPORT","state":"NH","lat":43.20488,"lon":-71.50257,"elev_ft":338},{"icao":"KLEB","ghcn":"USW00094765","name":"LEBANON MUNICIPAL AIRPORT","state":"NH","lat":43.62707,"lon":-72.30537,"elev_ft":554},{"icao":"KMHT","ghcn":"USW00014710","name":"MANCHESTER AIRPORT","state":"NH","lat":42.92963,"lon":-71.43559,"elev_ft":229},{"icao":"KPSM","ghcn":"USW00004743","name":"PORTSMOUTH PEASE AFB","state":"NH","lat":43.08333,"lon":-70.81667,"elev_ft":100},{"icao":"KACY","ghcn":"USW00093730","name":"ATLANTIC CITY INTL AP","state":"NJ","lat":39.45203,"lon":-74.56701,"elev_ft":58},{"icao":"KEWR","ghcn":"USW00014734","name":"NEWARK LIBERTY INTL AP","state":"NJ","lat":40.68275,"lon":-74.16927,"elev_ft":6},{"icao":"KMMU","ghcn":"USW00054738","name":"MORRISTOWN","state":"NJ","lat":40.8,"lon":-74.41667,"elev_ft":187},{"icao":"KTEB","ghcn":"USW00094741","name":"TETERBORO AIRPORT","state":"NJ","lat":40.85898,"lon":-74.05616,"elev_ft":3},{"icao":"KTTN","ghcn":"USW00014792","name":"TRENTON-MERCER AIRPORT","state":"NJ","lat":40.27681,"lon":-74.81587,"elev_ft":190},{"icao":"KABQ","ghcn":"USW00023050","name":"ALBUQUERQUE INTL AP","state":"NM","lat":35.04189,"lon":-106.61545,"elev_ft":5310},{"icao":"KCNM","ghcn":"USW00093033","name":"CAVERN CITY AIRPORT","state":"NM","lat":32.33355,"lon":-104.25846,"elev_ft":3250},{"icao":"KFMN","ghcn":"USW00023090","name":"FARMINGTON FOUR CORNERS REGIONAL AP","state":"NM","lat":36.74354,"lon":-108.22931,"elev_ft":5499},{"icao":"KHOB","ghcn":"USC00294028","name":"HOBBS FAA","state":"NM","lat":32.6933,"lon":-103.2125,"elev_ft":3655},{"icao":"KLRU","ghcn":"USW00093041","name":"LAS CRUCES MUNICIPAL AP","state":"NM","lat":32.28333,"lon":-106.91667,"elev_ft":4454},{"icao":"KROW","ghcn":"USW00023009","name":"ROSWELL INDUSTRIAL AIR PARK","state":"NM","lat":33.30735,"lon":-104.50817,"elev_ft":3624},{"icao":"KSAF","ghcn":"USW00023049","name":"SANTA FE COUNTY MUNICIPAL AP","state":"NM","lat":35.61096,"lon":-106.09574,"elev_ft":6287},{"icao":"KSVC","ghcn":"USW00093063","name":"SILVER CITY GRANT COUNTY AP","state":"NM","lat":32.63333,"lon":-108.16667,"elev_ft":5373},{"icao":"KCXP","ghcn":"USW00000171","name":"CARSON AIRPORT","state":"NV","lat":39.183,"lon":-119.733,"elev_ft":4699},{"icao":"KEKO","ghcn":"USW00024121","name":"ELKO REGIONAL AIRPORT","state":"NV","lat":40.82402,"lon":-115.78635,"elev_ft":5054},{"icao":"KELY","ghcn":"USW00023154","name":"ELY AIRPORT","state":"NV","lat":39.29537,"lon":-114.84666,"elev_ft":6250},{"icao":"KLAS","ghcn":"USW00023169","name":"HARRY REID INTL AP","state":"NV","lat":36.0719,"lon":-115.16343,"elev_ft":2175},{"icao":"KRNO","ghcn":"USW00023185","name":"RENO AIRPORT","state":"NV","lat":39.50769,"lon":-119.76829,"elev_ft":4405},{"icao":"KVGT","ghcn":"USW00053123","name":"LAS VEGAS AIR TERMINAL","state":"NV","lat":36.21205,"lon":-115.19394,"elev_ft":2189},{"icao":"KWMC","ghcn":"USW00024128","name":"WINNEMUCCA AIRPORT","state":"NV","lat":40.90178,"lon":-117.80812,"elev_ft":4300},{"icao":"KALB","ghcn":"USW00014735","name":"ALBANY INTERNATIONAL AIRPORT","state":"NY","lat":42.74722,"lon":-73.79913,"elev_ft":280},{"icao":"KBGM","ghcn":"USW00004725","name":"BINGHAMTON (GREATER AP)","state":"NY","lat":42.20678,"lon":-75.97993,"elev_ft":1593},{"icao":"KBUF","ghcn":"USW00014733","name":"BUFFALO NIAGARA INTERNATIONAL AIRPOR","state":"NY","lat":42.93998,"lon":-78.73606,"elev_ft":709},{"icao":"KELM","ghcn":"USW00014748","name":"ELMIRA CORNING REGIONAL AP","state":"NY","lat":42.15658,"lon":-76.90291,"elev_ft":936},{"icao":"KIAG","ghcn":"USW00004724","name":"NIAGARA FALLS INTL AP","state":"NY","lat":43.1083,"lon":-78.93818,"elev_ft":585},{"icao":"KISP","ghcn":"USW00004781","name":"ISLIP-LI MACARTHUR AP","state":"NY","lat":40.79389,"lon":-73.10181,"elev_ft":83},{"icao":"KJFK","ghcn":"USW00094789","name":"JFK INTERNATIONAL AIRPORT","state":"NY","lat":40.63915,"lon":-73.7639,"elev_ft":9},{"icao":"KLGA","ghcn":"USW00014732","name":"LAGUARDIA AIRPORT","state":"NY","lat":40.77945,"lon":-73.88027,"elev_ft":10},{"icao":"KPOU","ghcn":"USW00014757","name":"POUGHKEEPSIE/HUDSON VALLEY REGIONAL AIRPORT","state":"NY","lat":41.62574,"lon":-73.88155,"elev_ft":153},{"icao":"KROC","ghcn":"USW00014768","name":"FREDERICK DOUGLASS GREATER ROCHESTER INTERNATIONAL AIRPORT","state":"NY","lat":43.11723,"lon":-77.67539,"elev_ft":540},{"icao":"KSWF","ghcn":"USW00014714","name":"STEWART FIELD","state":"NY","lat":41.5,"lon":-74.1,"elev_ft":491},{"icao":"KSYR","ghcn":"USW00014771","name":"SYRACUSE HANCOCK INTL AP","state":"NY","lat":43.1111,"lon":-76.10384,"elev_ft":410},{"icao":"KCAK","ghcn":"USW00014895","name":"AKRON CANTON AP","state":"OH","lat":40.91811,"lon":-81.44342,"elev_ft":1210},{"icao":"KCLE","ghcn":"USW00014820","name":"CLEVELAND-HOPKINS INTL AP","state":"OH","lat":41.40568,"lon":-81.85191,"elev_ft":777},{"icao":"KCMH","ghcn":"USW00014821","name":"JOHN GLENN INTERNATIONAL AIRPORT","state":"OH","lat":39.99068,"lon":-82.87703,"elev_ft":810},{"icao":"KDAY","ghcn":"USW00093815","name":"DAYTON INTERNATIONAL AIRPORT","state":"OH","lat":39.90638,"lon":-84.21853,"elev_ft":993},{"icao":"KFFO","ghcn":"USW00013840","name":"DAYTON WRIGHT PATTERSON AFB","state":"OH","lat":39.83333,"lon":-84.05,"elev_ft":823},{"icao":"KLCK","ghcn":"USW00013812","name":"COLUMBUS RICKENBACKER","state":"OH","lat":39.81667,"lon":-82.93333,"elev_ft":744},{"icao":"KMFD","ghcn":"USW00014891","name":"MANSFIELD LAHM RGNL AP","state":"OH","lat":40.8204,"lon":-82.51769,"elev_ft":1289},{"icao":"KTOL","ghcn":"USW00094830","name":"TOLEDO EXPRESS AP","state":"OH","lat":41.58705,"lon":-83.80538,"elev_ft":674},{"icao":"KYNG","ghcn":"USW00014852","name":"YOUNGSTOWN-WARREN RGNL AP","state":"OH","lat":41.25478,"lon":-80.67361,"elev_ft":1167},{"icao":"KADM","ghcn":"USW00093940","name":"ARDMORE MUNICIPAL AP","state":"OK","lat":34.3,"lon":-97.01667,"elev_ft":725},{"icao":"KEND","ghcn":"USW00013909","name":"ENID VANCE AFB","state":"OK","lat":36.33333,"lon":-97.91667,"elev_ft":1306},{"icao":"KLAW","ghcn":"USW00003950","name":"LAWTON MUNICIPAL AP","state":"OK","lat":34.55771,"lon":-98.4172,"elev_ft":1070},{"icao":"KOKC","ghcn":"USW00013967","name":"OKLAHOMA CITY WILL ROGERS WORLD AP","state":"OK","lat":35.38843,"lon":-97.60035,"elev_ft":1279},{"icao":"KTUL","ghcn":"USW00013968","name":"TULSA INTL AIRPORT","state":"OK","lat":36.19854,"lon":-95.87825,"elev_ft":639},{"icao":"KWDG","ghcn":"USW00053986","name":"ENID WOODRING AP","state":"OK","lat":36.38333,"lon":-97.8,"elev_ft":1167},{"icao":"KAST","ghcn":"USW00094224","name":"ASTORIA AIRPORT (PORT OF)","state":"OR","lat":46.15694,"lon":-123.88326,"elev_ft":11},{"icao":"KEUG","ghcn":"USW00024221","name":"EUGENE-MAHLON SWEET FIELD","state":"OR","lat":44.13311,"lon":-123.21563,"elev_ft":358},{"icao":"KMFR","ghcn":"USW00024225","name":"MEDFORD INTL AP","state":"OR","lat":42.37503,"lon":-122.87702,"elev_ft":1313},{"icao":"KOTH","ghcn":"USW00024284","name":"NORTH BEND SOUTHWEST OREGON REGIONAL AP","state":"OR","lat":43.41333,"lon":-124.24361,"elev_ft":17},{"icao":"KPDT","ghcn":"USW00024155","name":"PENDLETON E OR RGNL AP","state":"OR","lat":45.6975,"lon":-118.83446,"elev_ft":1485},{"icao":"KPDX","ghcn":"USW00024229","name":"PORTLAND INTL AIRPORT","state":"OR","lat":45.59578,"lon":-122.60919,"elev_ft":22},{"icao":"KRDM","ghcn":"USW00024230","name":"REDMOND AIRPORT","state":"OR","lat":44.2558,"lon":-121.1407,"elev_ft":3049},{"icao":"KSLE","ghcn":"USW00024232","name":"SALEM AP (MCNARY FIELD)","state":"OR","lat":44.90488,"lon":-123.00103,"elev_ft":208},{"icao":"KABE","ghcn":"USW00014737","name":"ALLENTOWN LEHIGH VALLEY INTERNATIONAL AIRPORT","state":"PA","lat":40.64984,"lon":-75.44773,"elev_ft":385},{"icao":"KAOO","ghcn":"USW00014736","name":"ALTOONA BLAIR COUNTY AP","state":"PA","lat":40.29993,"lon":-78.3168,"elev_ft":1465},{"icao":"KAVP","ghcn":"USW00014777","name":"WILKES-BARRE/SCRANTON INTERNATIONAL AIRPORT","state":"PA","lat":41.33349,"lon":-75.72273,"elev_ft":951},{"icao":"KERI","ghcn":"USW00014860","name":"ERIE INTL AP","state":"PA","lat":42.08026,"lon":-80.18236,"elev_ft":729},{"icao":"KIPT","ghcn":"USW00014778","name":"WILLIAMSPORT REGIONAL AP","state":"PA","lat":41.24295,"lon":-76.92173,"elev_ft":524},{"icao":"KLNS","ghcn":"USW00054737","name":"LANCASTER AIRPORT","state":"PA","lat":40.12061,"lon":-76.29446,"elev_ft":397},{"icao":"KMDT","ghcn":"USW00014711","name":"MIDDLETOWN HARRISBURG INT'L AP","state":"PA","lat":40.1962,"lon":-76.77249,"elev_ft":299},{"icao":"KPHL","ghcn":"USW00013739","name":"PHILADELPHIA INTL AP","state":"PA","lat":39.87326,"lon":-75.22681,"elev_ft":7},{"icao":"KPIT","ghcn":"USW00094823","name":"PITTSBURGH INTERNATIONAL AIRPORT","state":"PA","lat":40.48459,"lon":-80.21448,"elev_ft":1119},{"icao":"TJSJ","ghcn":"RQW00011641","name":"SAN JUAN L M MARIN INTL AP","state":"PR","lat":18.43261,"lon":-66.01065,"elev_ft":10},{"icao":"KOQU","ghcn":"USW00054752","name":"NORTH KINGSTOWN QUONSET STATE AP","state":"RI","lat":41.59713,"lon":-71.41213,"elev_ft":19},{"icao":"KPVD","ghcn":"USW00014765","name":"RHODE ISLAND T.F. GREEN INTERNATIONAL AIRPORT","state":"RI","lat":41.72252,"lon":-71.43248,"elev_ft":51},{"icao":"KUUU","ghcn":"USW00014787","name":"NEWPORT STATE AP","state":"RI","lat":41.52991,"lon":-71.28331,"elev_ft":148},{"icao":"KAND","ghcn":"USW00093846","name":"ANDERSON REGIONAL AIRPORT","state":"SC","lat":34.498,"lon":-82.70924,"elev_ft":767},{"icao":"KCAE","ghcn":"USW00013883","name":"COLUMBIA METROPOLITAN AP","state":"SC","lat":33.94225,"lon":-81.11802,"elev_ft":224},{"icao":"KCHS","ghcn":"USW00013880","name":"CHARLESTON INTL. AIRPORT","state":"SC","lat":32.89945,"lon":-80.0407,"elev_ft":39},{"icao":"KFLO","ghcn":"USW00013744","name":"FLORENCE REGIONAL AIRPORT","state":"SC","lat":34.18773,"lon":-79.73079,"elev_ft":141},{"icao":"KGSP","ghcn":"USW00003870","name":"GRNVL SPART INTL AP","state":"SC","lat":34.90614,"lon":-82.21253,"elev_ft":966},{"icao":"KMYR","ghcn":"USW00013717","name":"MYRTLE BEACH AFB","state":"SC","lat":33.68333,"lon":-78.93333,"elev_ft":25},{"icao":"KABR","ghcn":"USW00014929","name":"ABERDEEN REGIONAL AP","state":"SD","lat":45.44358,"lon":-98.41384,"elev_ft":1298},{"icao":"KATY","ghcn":"USW00014946","name":"WATERTOWN REGIONAL AP","state":"SD","lat":44.90452,"lon":-97.14957,"elev_ft":1741},{"icao":"KFSD","ghcn":"USW00014944","name":"SIOUX FALLS FOSS FIELD","state":"SD","lat":43.57751,"lon":-96.75387,"elev_ft":1419},{"icao":"KHON","ghcn":"USW00014936","name":"HURON REGIONAL AP","state":"SD","lat":44.37916,"lon":-98.22275,"elev_ft":1282},{"icao":"KMHE","ghcn":"USW00094950","name":"MITCHELL AP","state":"SD","lat":43.77425,"lon":-98.03838,"elev_ft":1301},{"icao":"KRAP","ghcn":"USW00024090","name":"RAPID CITY REGIONAL AP","state":"SD","lat":44.04582,"lon":-103.05442,"elev_ft":3162},{"icao":"KBNA","ghcn":"USW00013897","name":"NASHVILLE INTL AP","state":"TN","lat":36.11054,"lon":-86.68815,"elev_ft":587},{"icao":"KCHA","ghcn":"USW00013882","name":"CHATTANOOGA AP","state":"TN","lat":35.03363,"lon":-85.20039,"elev_ft":669},{"icao":"KMEM","ghcn":"USW00013893","name":"MEMPHIS INTERNATIONAL AP","state":"TN","lat":35.05639,"lon":-89.9864,"elev_ft":251},{"icao":"KMRC","ghcn":"USW00000463","name":"MAURY COUNTY AIRPORT","state":"TN","lat":35.55438,"lon":-87.17913,"elev_ft":682},{"icao":"KTRI","ghcn":"USW00013877","name":"BRISTOL AP","state":"TN","lat":36.47964,"lon":-82.39893,"elev_ft":1496},{"icao":"KTYS","ghcn":"USW00013891","name":"KNOXVILLE AP","state":"TN","lat":35.81801,"lon":-83.98573,"elev_ft":971},{"icao":"KABI","ghcn":"USW00013962","name":"ABILENE REGIONAL AP","state":"TX","lat":32.41063,"lon":-99.68208,"elev_ft":1787},{"icao":"KACT","ghcn":"USW00013959","name":"WACO REGIONAL AP","state":"TX","lat":31.61796,"lon":-97.2283,"elev_ft":498},{"icao":"KAMA","ghcn":"USW00023047","name":"AMARILLO AP","state":"TX","lat":35.22027,"lon":-101.71733,"elev_ft":3607},{"icao":"KATA","ghcn":"USI0000KATA","name":"HALL MILLER MUNI","state":"TX","lat":33.10181,"lon":-94.19533,"elev_ft":280},{"icao":"KBMQ","ghcn":"USW00003999","name":"BURNET MUNICIPAL AP","state":"TX","lat":30.74067,"lon":-98.23539,"elev_ft":1267},{"icao":"KBRO","ghcn":"USW00012919","name":"BROWNSVILLE S PADRE ISLAND INTL AP","state":"TX","lat":25.91459,"lon":-97.42314,"elev_ft":19},{"icao":"KBSM","ghcn":"USW00013904","name":"AUSTIN BERGSTROM INTL AP","state":"TX","lat":30.18311,"lon":-97.67989,"elev_ft":481},{"icao":"KCRP","ghcn":"USW00012924","name":"CORPUS CHRISTI INTL AP","state":"TX","lat":27.77335,"lon":-97.51302,"elev_ft":41},{"icao":"KDAL","ghcn":"USW00013960","name":"DALLAS FAA AP","state":"TX","lat":32.83839,"lon":-96.83583,"elev_ft":484},{"icao":"KDFW","ghcn":"USW00003927","name":"DAL-FTW WSCMO AP","state":"TX","lat":32.89744,"lon":-97.02196,"elev_ft":544},{"icao":"KDHT","ghcn":"USW00093042","name":"DALHART FAA AIRPORT","state":"TX","lat":36.02516,"lon":-102.54875,"elev_ft":3988},{"icao":"KEBG","ghcn":"USW00012983","name":"EDINBURG INTERNATIONAL AIRPORT","state":"TX","lat":26.44194,"lon":-98.12944,"elev_ft":80},{"icao":"KELP","ghcn":"USW00023044","name":"EL PASO INTL AP","state":"TX","lat":31.81234,"lon":-106.37737,"elev_ft":3944},{"icao":"KFST","ghcn":"USW00023091","name":"FORT STOCKTON PECOS COUNTY AP","state":"TX","lat":30.91193,"lon":-102.91714,"elev_ft":3011},{"icao":"KGGG","ghcn":"USW00003901","name":"LONGVIEW E TX RGNL AP","state":"TX","lat":32.39094,"lon":-94.71396,"elev_ft":352},{"icao":"KHOU","ghcn":"USW00012918","name":"HOUSTON WILLIAM P HOBBY AP","state":"TX","lat":29.64586,"lon":-95.28212,"elev_ft":43},{"icao":"KIAH","ghcn":"USW00012960","name":"HOUSTON INTERCONTINENTAL AP","state":"TX","lat":29.98438,"lon":-95.36072,"elev_ft":90},{"icao":"KLRD","ghcn":"USW00012907","name":"LAREDO INTL AP","state":"TX","lat":27.53333,"lon":-99.46667,"elev_ft":494},{"icao":"KMAF","ghcn":"USW00023023","name":"MIDLAND INTERNATIONAL AP","state":"TX","lat":31.94754,"lon":-102.20859,"elev_ft":2862},{"icao":"KSAT","ghcn":"USW00012921","name":"SAN ANTONIO INTL AP","state":"TX","lat":29.54429,"lon":-98.48395,"elev_ft":799},{"icao":"KSPS","ghcn":"USW00013966","name":"WICHITA FALLS MUNICIPAL AP","state":"TX","lat":33.97855,"lon":-98.49298,"elev_ft":1013},{"icao":"KCDC","ghcn":"USW00093129","name":"CEDAR CITY AP","state":"UT","lat":37.70672,"lon":-113.09698,"elev_ft":5590},{"icao":"KOGD","ghcn":"USW00024126","name":"OGDEN HINKLEY AIRPORT","state":"UT","lat":41.19406,"lon":-112.01682,"elev_ft":4449},{"icao":"KPVU","ghcn":"USC00427061","name":"PROVO AIRPORT","state":"UT","lat":40.21889,"lon":-111.72333,"elev_ft":4497},{"icao":"KSGU","ghcn":"USW00023186","name":"ST GEORGE MUNICIPAL AP","state":"UT","lat":37.0451,"lon":-113.50561,"elev_ft":2936},{"icao":"KSLC","ghcn":"USW00024127","name":"SALT LAKE CITY INTL ARPT","state":"UT","lat":40.77069,"lon":-111.96503,"elev_ft":4227},{"icao":"KVEL","ghcn":"USW00094030","name":"VERNAL MUNICIPAL AP","state":"UT","lat":40.44293,"lon":-109.51278,"elev_ft":5266},{"icao":"KCHO","ghcn":"USW00093736","name":"CHARLOTTESVILLE ALBEMARLE AIRPORT","state":"VA","lat":38.1374,"lon":-78.45513,"elev_ft":631},{"icao":"KDAN","ghcn":"USW00013728","name":"DANVILLE REGIONAL AIRPORT","state":"VA","lat":36.57286,"lon":-79.33496,"elev_ft":552},{"icao":"KDCA","ghcn":"USW00013743","name":"WASHINGTON REAGAN NATIONAL AIRPORT","state":"VA","lat":38.84721,"lon":-77.03454,"elev_ft":13},{"icao":"KIAD","ghcn":"USW00093738","name":"WASHINGTON DULLES INTL AP","state":"VA","lat":38.93485,"lon":-77.44728,"elev_ft":294},{"icao":"KLYH","ghcn":"USW00013733","name":"LYNCHBURG REGIONAL AIRPORT","state":"VA","lat":37.32126,"lon":-79.20649,"elev_ft":902},{"icao":"KORF","ghcn":"USW00013737","name":"NORFOLK INTL AP","state":"VA","lat":36.90371,"lon":-76.19266,"elev_ft":11},{"icao":"KPHF","ghcn":"USW00093741","name":"NEWPORT NEWS INTL AP","state":"VA","lat":37.13216,"lon":-76.49399,"elev_ft":36},{"icao":"KRIC","ghcn":"USW00013740","name":"RICHMOND INTERNATIONAL AP","state":"VA","lat":37.51154,"lon":-77.32338,"elev_ft":166},{"icao":"KROA","ghcn":"USW00013741","name":"ROANOKE-BLACKSBURG RGNL AP","state":"VA","lat":37.31719,"lon":-79.97369,"elev_ft":1138},{"icao":"KBTV","ghcn":"USW00014742","name":"BURLINGTON INTERNATIONAL AIRPORT","state":"VT","lat":44.46825,"lon":-73.1499,"elev_ft":332},{"icao":"KEFK","ghcn":"USW00054758","name":"NEWPORT STATE AP","state":"VT","lat":44.88333,"lon":-72.23333,"elev_ft":915},{"icao":"KMPV","ghcn":"USW00094705","name":"MONTPELIER - EDWARD F. KNAPP STATE AIRPORT","state":"VT","lat":44.20503,"lon":-72.56545,"elev_ft":1105},{"icao":"KRUT","ghcn":"USW00094737","name":"RUTLAND STATE AP","state":"VT","lat":43.53333,"lon":-72.95,"elev_ft":784},{"icao":"KBLI","ghcn":"USW00024217","name":"BELLINGHAM INTL AP","state":"WA","lat":48.7991,"lon":-122.54069,"elev_ft":150},{"icao":"KEAT","ghcn":"USW00094239","name":"WENATCHEE PANGBORN MEMORIAL AP","state":"WA","lat":47.39746,"lon":-120.20124,"elev_ft":1238},{"icao":"KGEG","ghcn":"USW00024157","name":"SPOKANE INTERNATIONAL AIRPORT","state":"WA","lat":47.62168,"lon":-117.52796,"elev_ft":2355},{"icao":"KMWH","ghcn":"USW00024110","name":"MOSES LAKE GRANT COUNTY AP","state":"WA","lat":47.19295,"lon":-119.31459,"elev_ft":1169},{"icao":"KOLM","ghcn":"USW00024227","name":"OLYMPIA AP","state":"WA","lat":46.97371,"lon":-122.90493,"elev_ft":200},{"icao":"KPAE","ghcn":"USW00024222","name":"EVERETT SNOHOMISH COUNTY AP","state":"WA","lat":47.92322,"lon":-122.28308,"elev_ft":548},{"icao":"KPSC","ghcn":"USW00024163","name":"PASCO TRI CITIES AIRPORT","state":"WA","lat":46.2695,"lon":-119.11816,"elev_ft":400},{"icao":"KSEA","ghcn":"USW00024233","name":"SEATTLE TACOMA AIRPORT","state":"WA","lat":47.44467,"lon":-122.31442,"elev_ft":369},{"icao":"KYKM","ghcn":"USW00024243","name":"YAKIMA AIRPORT","state":"WA","lat":46.56398,"lon":-120.53488,"elev_ft":1053},{"icao":"KATW","ghcn":"USW00004825","name":"APPLETON OUTAGAMIE COUNTY AP","state":"WI","lat":44.26667,"lon":-88.51667,"elev_ft":917},{"icao":"KCWA","ghcn":"USW00094890","name":"MOSINEE","state":"WI","lat":44.78333,"lon":-89.66667,"elev_ft":1277},{"icao":"KEAU","ghcn":"USW00014991","name":"CHIPPEWA VALLEY REGIONAL AIRPORT","state":"WI","lat":44.86654,"lon":-91.48809,"elev_ft":884},{"icao":"KGRB","ghcn":"USW00014898","name":"GREEN BAY A S INTL AP","state":"WI","lat":44.47958,"lon":-88.1371,"elev_ft":684},{"icao":"KLSE","ghcn":"USW00014920","name":"LA CROSSE REGIONAL AIRPORT","state":"WI","lat":43.87922,"lon":-91.25301,"elev_ft":650},{"icao":"KMKE","ghcn":"USW00014839","name":"MILWAUKEE MITCHELL AIRPORT","state":"WI","lat":42.95489,"lon":-87.9045,"elev_ft":667},{"icao":"KMSN","ghcn":"USW00014837","name":"MADISON DANE COUNTY REGIONAL AP","state":"WI","lat":43.14069,"lon":-89.34521,"elev_ft":859},{"icao":"KRHI","ghcn":"USW00004803","name":"RHINELANDER ONEIDA COUNTY AP","state":"WI","lat":45.63143,"lon":-89.4824,"elev_ft":1648},{"icao":"KBKW","ghcn":"USW00003872","name":"BECKLEY RALEIGH COUNTY AIRPORT","state":"WV","lat":37.78359,"lon":-81.12283,"elev_ft":2494},{"icao":"KCKB","ghcn":"USW00003802","name":"CLARKSBURG BENEDUM AP","state":"WV","lat":39.30218,"lon":-80.22392,"elev_ft":1205},{"icao":"KCRW","ghcn":"USW00013866","name":"CHARLESTON - WEST VIRGINIA INTERNATIONAL YEAGER AIRPORT","state":"WV","lat":38.3795,"lon":-81.59112,"elev_ft":912},{"icao":"KEKN","ghcn":"USW00013729","name":"ELKINS- RANDOLPH COUNTY AIRPORT","state":"WV","lat":38.8899,"lon":-79.85544,"elev_ft":1955},{"icao":"KHTS","ghcn":"USW00003860","name":"HUNTINGTON TRI-STATE AIRPORT","state":"WV","lat":38.36531,"lon":-82.5548,"elev_ft":824},{"icao":"KCOD","ghcn":"USW00024045","name":"CODY MUNICIPAL AP","state":"WY","lat":44.51667,"lon":-109.01667,"elev_ft":5092},{"icao":"KCPR","ghcn":"USW00024089","name":"CASPER-NATRONA COUNTY AP","state":"WY","lat":42.89778,"lon":-106.47361,"elev_ft":5319},{"icao":"KCYS","ghcn":"USW00024018","name":"CHEYENNE WSFO AP","state":"WY","lat":41.15788,"lon":-104.80814,"elev_ft":6118},{"icao":"KGCC","ghcn":"USW00094023","name":"GILLETTE CAMPBELL COUNTY AP","state":"WY","lat":44.33983,"lon":-105.54159,"elev_ft":4364},{"icao":"KJAC","ghcn":"USW00024166","name":"JACKSON HOLE AP","state":"WY","lat":43.6,"lon":-110.73333,"elev_ft":6419},{"icao":"KLAR","ghcn":"USW00024022","name":"LARAMIE AP","state":"WY","lat":41.3165,"lon":-105.67288,"elev_ft":7273},{"icao":"KRIW","ghcn":"USW00024061","name":"RIVERTON REGIONAL AP","state":"WY","lat":43.06217,"lon":-108.44705,"elev_ft":5447},{"icao":"KRKS","ghcn":"USW00024027","name":"ROCK SPRINGS AP","state":"WY","lat":41.59465,"lon":-109.0529,"elev_ft":6758},{"icao":"KSHR","ghcn":"USW00024029","name":"SHERIDAN AIRPORT","state":"WY","lat":44.76031,"lon":-106.97413,"elev_ft":3971}]"""
STATIONS_ROSTER = json.loads(_STATIONS_ROSTER_JSON)

# ================================================================
# HELPERS
# ================================================================

def _http_get(url, params=None, retries=1):
    """GET with one retry on failure. Raises on final failure."""
    last_err = None
    for attempt in range(retries + 1):
        try:
            r = requests.get(url, params=params, headers=HTTP_HEADERS, timeout=REQUEST_TIMEOUT)
            r.raise_for_status()
            return r
        except Exception as e:
            last_err = e
            if attempt < retries:
                time.sleep(RETRY_SLEEP)
    raise last_err


def _http_post(url, json_body, retries=1):
    """POST with one retry on failure. Raises on final failure."""
    last_err = None
    for attempt in range(retries + 1):
        try:
            r = requests.post(url, json=json_body, headers=HTTP_HEADERS, timeout=REQUEST_TIMEOUT)
            r.raise_for_status()
            return r
        except Exception as e:
            last_err = e
            if attempt < retries:
                time.sleep(RETRY_SLEEP)
    raise last_err


def _num_or_none(v):
    """Convert an NCEI normals value to float, mapping missing sentinels to None."""
    if v is None:
        return None
    if isinstance(v, dict):  # defensive: some NCEI API responses nest as {"value": "..."}
        v = v.get("value")
    if v in NCEI_MISSING_SENTINELS:
        return None
    s = str(v).strip()
    if s == "" or s.upper() in ("M", "NAN"):
        return None
    try:
        f = float(s)
    except ValueError:
        return None
    if f in (-7777.0, -9999.0):
        return None
    return round(f, 2)


CITY_NAME_STRIP_WORDS = [
    "INTERNATIONAL AIRPORT", "INTERNATIONAL AP", "INTL AIRPORT", "INTL AP",
    "REGIONAL AIRPORT", "REGIONAL AP", "MUNICIPAL AIRPORT", "MUNICIPAL AP",
    "COUNTY AIRPORT", "COUNTY AP", "METRO AIRPORT", "METRO AP",
    "AIRPORT", "INTERNATIONAL", "INTL", "REGIONAL", "MUNICIPAL", " AP",
    "AFB", "ANGB", "FIELD", "AAF",
]

def clean_city_name(raw_name):
    """
    Best-effort cleanup of a raw NOAA/airport station name (e.g.
    'MIDDLETOWN HARRISBURG INTL AP') into something closer to a plain city
    name for display (e.g. 'Middletown Harrisburg'). This is heuristic, not
    authoritative — unlike the 11 hand-curated starter cities in the
    starter dataset, these names are derived programmatically and may
    retain airport-ish wording for some stations. Feel free to hand-edit
    the "name" field in the output JSON for any station where this doesn't
    read naturally.
    """
    s = raw_name.upper()
    # Drop a parenthetical suffix entirely, e.g. "ASTORIA AIRPORT (PORT OF)"
    if "(" in s:
        s = s.split("(")[0]
    changed = True
    while changed:
        changed = False
        stripped = s.strip()
        for word in CITY_NAME_STRIP_WORDS:
            if stripped.endswith(word):
                stripped = stripped[: -len(word)].strip()
                changed = True
        s = stripped
    if not s:
        s = raw_name.upper()
    return s.title().replace("Int'L", "Int'l")


def fetch_normals(ghcn_id):
    """
    Fetch 1991-2020 monthly climate normals for one GHCN station from NOAA
    NCEI. Returns a list of 12 dicts (Jan..Dec) with keys:
    tmax, tmin, tavg, prcp, prcp_med, snow (float or None).
    """
    params = {
        "dataset": "normals-monthly",
        "stations": ghcn_id,
        "format": "json",
        "units": "standard",
    }
    r = _http_get(NCEI_BASE, params=params, retries=1)
    time.sleep(RATE_LIMIT_SLEEP)
    records = r.json()
    if not isinstance(records, list):
        raise ValueError(f"unexpected NCEI response shape: {type(records)}")

    months = [dict(tmax=None, tmin=None, tavg=None, prcp=None, prcp_med=None, snow=None) for _ in range(12)]
    found_any = False
    for rec in records:
        date_str = rec.get("DATE") or rec.get("date")
        if not date_str:
            continue
        try:
            month = int(str(date_str).split("-")[1])
        except (IndexError, ValueError):
            continue
        if not (1 <= month <= 12):
            continue
        mi = month - 1
        months[mi]["tmax"] = _num_or_none(rec.get("MLY-TMAX-NORMAL"))
        months[mi]["tmin"] = _num_or_none(rec.get("MLY-TMIN-NORMAL"))
        months[mi]["tavg"] = _num_or_none(rec.get("MLY-TAVG-NORMAL"))
        months[mi]["prcp"] = _num_or_none(rec.get("MLY-PRCP-NORMAL"))
        months[mi]["prcp_med"] = _num_or_none(rec.get("MLY-PRCP-50PCTL"))
        months[mi]["snow"] = _num_or_none(rec.get("MLY-SNOW-NORMAL"))
        found_any = True
    if not found_any:
        raise ValueError("no monthly normals records returned")
    return months


def _acis_num(s, trace_as_zero=False):
    """Parse an ACIS daily value. 'M' = missing, 'T' = trace precip."""
    if s in ACIS_MISSING_FLAGS:
        return None
    s = str(s).strip()
    if s in ACIS_MISSING_FLAGS:
        return None
    if s == ACIS_TRACE_FLAG:
        return 0.0 if trace_as_zero else None
    # ACIS sometimes suffixes a flag character onto the value, e.g. "55A"
    core = s.rstrip("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
    try:
        return float(core)
    except ValueError:
        return None


def fetch_extremes(icao):
    """
    Fetch full period-of-record daily maxt/mint/pcpn for a station from ACIS
    StnData and reduce client-side into:
      record_high[12]        — highest daily max temp ever seen, per calendar month
      record_low[12]         — lowest daily min temp ever seen, per calendar month
      extreme_prcp[12]       — highest calendar-month total precip on record
      extreme_prcp_year[12]  — the year that monthly total occurred

    NOTE: months with any missing daily precip observations sum only the
    days that were reported, which can under-count a partial/incomplete
    month. This is a minor, acceptable bias for a "record extreme" figure —
    a station's own long period of record almost always contains a complete
    month that beats any undercount from a spotty one.
    """
    body = {
        "sid": f"{icao} 5",
        "sdate": "por",
        "edate": "por",
        "elems": [{"name": "maxt"}, {"name": "mint"}, {"name": "pcpn"}],
    }
    r = _http_post(ACIS_STNDATA_URL, body, retries=1)
    time.sleep(RATE_LIMIT_SLEEP)
    payload = r.json()
    rows = payload.get("data", [])
    if not rows:
        raise ValueError("no daily data returned")

    record_high = [None] * 12
    record_low = [None] * 12
    monthly_totals = {}  # (year, month) -> summed precip

    for row in rows:
        if len(row) < 4:
            continue
        date_str, maxt_s, mint_s, pcpn_s = row[0], row[1], row[2], row[3]
        try:
            y, m, _d = (int(x) for x in str(date_str).split("-"))
        except ValueError:
            continue
        if not (1 <= m <= 12):
            continue
        mi = m - 1

        maxt = _acis_num(maxt_s)
        if maxt is not None and (record_high[mi] is None or maxt > record_high[mi]):
            record_high[mi] = maxt

        mint = _acis_num(mint_s)
        if mint is not None and (record_low[mi] is None or mint < record_low[mi]):
            record_low[mi] = mint

        pcpn = _acis_num(pcpn_s, trace_as_zero=True)
        if pcpn is not None:
            key = (y, m)
            monthly_totals[key] = monthly_totals.get(key, 0.0) + pcpn

    extreme_prcp = [None] * 12
    extreme_prcp_year = [None] * 12
    for (y, m), total in monthly_totals.items():
        mi = m - 1
        total = round(total, 2)
        if extreme_prcp[mi] is None or total > extreme_prcp[mi]:
            extreme_prcp[mi] = total
            extreme_prcp_year[mi] = y

    return record_high, record_low, extreme_prcp, extreme_prcp_year

# ================================================================
# MAIN
# ================================================================

def process_station(station, idx, total):
    """
    Returns (icao, entry_dict_or_None, status) where status is one of:
    'ok' (normals + extremes both succeeded), 'partial' (normals succeeded,
    extremes failed — station still included with record columns null),
    'failed' (normals failed after retry — station skipped),
    'skipped' (no GHCN crosswalk).
    """
    icao = station["icao"]
    ghcn = station.get("ghcn")
    name = station.get("name", icao)
    print(f"[{idx}/{total}] {icao} ({name})...", flush=True)

    if not ghcn:
        print(f"  SKIP: {icao} has no resolvable GHCN Daily crosswalk", file=sys.stderr)
        return icao, None, "skipped"

    try:
        months_normals = fetch_normals(ghcn)
    except Exception as e:
        print(f"  WARN: normals fetch failed for {icao} ({name}): {e}", file=sys.stderr)
        return icao, None, "failed"

    status = "ok"
    try:
        record_high, record_low, extreme_prcp, extreme_prcp_year = fetch_extremes(icao)
    except Exception as e:
        print(f"  WARN: extremes fetch failed for {icao} ({name}): {e} — keeping normals, record columns will be null", file=sys.stderr)
        record_high = record_low = extreme_prcp = extreme_prcp_year = [None] * 12
        status = "partial"

    months = []
    for mi in range(12):
        n = months_normals[mi]
        months.append({
            "tmax": n["tmax"], "tmin": n["tmin"], "tavg": n["tavg"],
            "prcp": n["prcp"], "prcp_med": n["prcp_med"], "snow": n["snow"],
            "record_high": record_high[mi], "record_low": record_low[mi],
            "extreme_prcp": extreme_prcp[mi], "extreme_prcp_year": extreme_prcp_year[mi],
        })

    entry = {
        "name": clean_city_name(name),
        "state": station["state"],
        "lat": station["lat"],
        "lon": station["lon"],
        "elev_ft": station["elev_ft"],
        "ghcn": ghcn,
        "months": months,
    }
    return icao, entry, status


def main():
    total = len(STATIONS_ROSTER)
    output = {}
    counts = {"ok": 0, "partial": 0, "failed": 0, "skipped": 0}

    print(f"ContextClimate climo_build.py — building climate normals for {total} stations")
    print(f"Output will be written to: {os.path.abspath(OUTPUT_PATH)}\n")

    for idx, station in enumerate(STATIONS_ROSTER, start=1):
        icao, entry, status = process_station(station, idx, total)
        counts[status] += 1
        if entry is not None:
            output[icao] = entry

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w") as f:
        json.dump(output, f, indent=1)

    print("\n" + "=" * 60)
    print("DONE")
    print(f"  Succeeded (normals + extremes): {counts['ok']}")
    print(f"  Partial   (normals only):       {counts['partial']}")
    print(f"  Failed    (skipped, error):     {counts['failed']}")
    print(f"  Skipped   (no GHCN crosswalk):  {counts['skipped']}")
    print(f"  Total written to {OUTPUT_PATH}: {len(output)} stations")
    print("=" * 60)


if __name__ == "__main__":
    main()
