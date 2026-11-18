"""Average CanESM5 monthly near-surface air temperature over each U.S. state.

Input:  CMIP6 CanESM5 historical r1i1p1f1 Amon/tas (gn, v20190429), read from
        the public Google Cloud CMIP6 bucket, and the 2024 Census Bureau
        cartographic state boundaries (1:500,000).
Output: state_monthly_tas.csv with one row per state, year and month.

Each grid cell is weighted by the area of its overlap with the state.

Run with:  uv run data/prepare_data.py
"""

from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
import shapely
import xarray as xr
from pyproj import Geod

ZARR_URL = (
    "gs://cmip6/CMIP6/CMIP/CCCma/CanESM5/historical/r1i1p1f1/Amon/tas/gn/v20190429/"
)
STATES_URL = "https://www2.census.gov/geo/tiger/GENZ2024/shp/cb_2024_us_state_500k.zip"
OUT_PATH = Path(__file__).parent / "state_monthly_tas.csv"

# 50 states only (drops DC, Puerto Rico and the territories)
NON_STATES = {"DC", "PR", "VI", "GU", "AS", "MP"}

geod = Geod(ellps="WGS84")


def to_0_360(geom):
    """Shift longitudes from -180..180 to 0..360 to match the model grid."""
    return shapely.transform(geom, lambda xy: np.column_stack([xy[:, 0] % 360, xy[:, 1]]))


def cell_edges(centers):
    """Cell edges halfway between centers, used when bounds are missing."""
    mid = (centers[:-1] + centers[1:]) / 2
    first = centers[0] - (mid[0] - centers[0])
    last = centers[-1] + (centers[-1] - mid[-1])
    return np.concatenate([[first], mid, [last]])


# Load model data (only the U.S. region is pulled over the network)
ds = xr.open_zarr(ZARR_URL, storage_options={"token": "anon"}, consolidated=True)
ds = ds.sel(lat=slice(15, 75), lon=slice(165, 300))
tas = ds["tas"].load() - 273.15  # Kelvin to Celsius

if "lat_bnds" in ds and "lon_bnds" in ds:
    lat_b = ds["lat_bnds"].values
    lon_b = ds["lon_bnds"].values
    if lat_b.ndim == 3:  # some stores keep a time dimension on bounds
        lat_b, lon_b = lat_b[0], lon_b[0]
else:
    lat_e = cell_edges(ds["lat"].values)
    lon_e = cell_edges(ds["lon"].values)
    lat_b = np.column_stack([lat_e[:-1], lat_e[1:]])
    lon_b = np.column_stack([lon_e[:-1], lon_e[1:]])

# Load state boundaries
states = gpd.read_file(STATES_URL).to_crs("EPSG:4326")
states = states[~states["STUSPS"].isin(NON_STATES)].reset_index(drop=True)
assert len(states) == 50, len(states)

# Overlap area (m^2) between every grid cell and every state
weights = {}
for _, st in states.iterrows():
    geom = shapely.make_valid(to_0_360(st.geometry))
    w = np.zeros((len(lat_b), len(lon_b)))
    minx, miny, maxx, maxy = geom.bounds
    for i, (la0, la1) in enumerate(lat_b):
        if la1 < miny or la0 > maxy:
            continue
        for j, (lo0, lo1) in enumerate(lon_b):
            if lo1 < minx or lo0 > maxx:
                continue
            piece = geom.intersection(shapely.box(lo0, la0, lo1, la1))
            if not piece.is_empty:
                w[i, j] = abs(geod.geometry_area_perimeter(piece)[0])
    weights[st["STUSPS"]] = (st["NAME"], w)

# Weighted state averages for every month
years = tas["time"].dt.year.values
months = tas["time"].dt.month.values
values = tas.values  # (time, lat, lon)

rows = []
for abbr, (name, w) in sorted(weights.items()):
    avg = (values * w).sum(axis=(1, 2)) / w.sum()
    rows.append(pd.DataFrame({
        "state": name,
        "abbr": abbr,
        "year": years,
        "month": months,
        "temp_c": avg.round(3),
    }))

out = pd.concat(rows, ignore_index=True)
out.to_csv(OUT_PATH, index=False)
print(f"Wrote {len(out)} rows to {OUT_PATH}")
