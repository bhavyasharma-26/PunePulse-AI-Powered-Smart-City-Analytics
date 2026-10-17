
from pathlib import Path

import numpy as np
import pandas as pd

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sklearn.ensemble import RandomForestRegressor, IsolationForest


app = FastAPI(
    title="PunePulse AI",
    description="AI-powered Pune Smart City Analytics",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "datasets"

# Verified mapping of the three OpenCity AQI CSV files.
STATION_NAMES = {
    "f421cdb4-57de-42ad-bd16-0bfd54e79cae": "Karve Road",
    "5ec1c512-c3f1-4ef6-81eb-4a5147241377": "Hadapsar",
    "6c9be432-4a82-4661-972f-e4ac9be0d252": "Bhosari",
}


def safe_number(series):
    return pd.to_numeric(series, errors="coerce")


def read_csv_safe(path):
    try:
        return pd.read_csv(path) if path.exists() else pd.DataFrame()
    except (OSError, ValueError, pd.errors.ParserError) as exc:
        print(f"Could not read {path.name}: {exc}")
        return pd.DataFrame()


# ---------------- AIR QUALITY DATA ----------------


def load_aqi():
    folder = DATA / "aqi" / "cleaned"

    STATION_NAMES = {
        "f421cdb4-57de-42ad-bd16-0bfd54e79cae": "Karve Road",
        "5ec1c512-c3f1-4ef6-81eb-4a5147241377": "Hadapsar",
        "6c9be432-4a82-4661-972f-e4ac9be0d252": "Bhosari",
    }

    frames = []

    if not folder.exists():
        print(f"AQI folder not found: {folder}")
        return pd.DataFrame(
            columns=["timestamp", "station", "reading"]
        )

    for file in sorted(folder.glob("*_clean.csv")):
        df = read_csv_safe(file)

        if df.empty:
            print(f"Skipping empty AQI file: {file.name}")
            continue

        if not {"timestamp", "reading"}.issubset(df.columns):
            print(f"Skipping invalid AQI file: {file.name}")
            continue

        df["timestamp"] = pd.to_datetime(
            df["timestamp"], errors="coerce"
        )
        df["reading"] = safe_number(df["reading"])

        df = df.dropna(subset=["timestamp", "reading"]).copy()

        if df.empty:
            print(f"No valid AQI readings in: {file.name}")
            continue

        dataset_id = file.stem.removesuffix("_clean")

        # Match UUID filenames to their actual station names.
        station_name = STATION_NAMES.get(
            dataset_id,
            dataset_id.replace("_", " ").strip().title()
        )

        df["station"] = station_name

        frames.append(df[["timestamp", "station", "reading"]])

        print(
            f"Loaded {len(df):,} AQI readings "
            f"for {station_name}"
        )

    if not frames:
        print("WARNING: No valid AQI datasets were loaded.")
        return pd.DataFrame(
            columns=["timestamp", "station", "reading"]
        )

    aqi = pd.concat(frames, ignore_index=True)

    print("\nAQI station verification:")
    print(
        aqi.groupby("station")["reading"]
        .agg(["count", "mean"])
        .to_string()
    )

    return aqi



# ---------------- TRAFFIC DATA ----------------

def load_traffic():
    folder = DATA / "traffic" / "extracted" / "traffic"
    vehicle_types = ["car", "motorbike", "bus", "truck"]
    totals = {}

    if not folder.exists():
        print(f"Traffic folder not found: {folder}")
        return totals

    files = list(folder.rglob("*.csv"))
    full_files = [f for f in files if not f.stem.endswith("_one")]
    files = full_files or files

    for file in files:
        try:
            df = pd.read_csv(file)

            if "Direction" not in df.columns:
                continue

            for vehicle in vehicle_types:
                if vehicle not in df.columns:
                    df[vehicle] = 0

                df[vehicle] = safe_number(
                    df[vehicle]
                ).fillna(0)

            df = df.dropna(subset=["Direction"])

            per_direction = df.groupby("Direction")[
                vehicle_types
            ].max()

            file_totals = per_direction.sum()
            junction = file.relative_to(folder).parts[0]

            totals.setdefault(
                junction,
                {vehicle: 0 for vehicle in vehicle_types},
            )

            for vehicle in vehicle_types:
                totals[junction][vehicle] += int(
                    file_totals[vehicle]
                )

        except (OSError, ValueError, pd.errors.ParserError) as exc:
            print(f"Traffic file skipped: {file.name}: {exc}")

    return totals


# ---------------- WASTE DATA ----------------

def read_waste_csv(filename):
    return read_csv_safe(DATA / "waste" / filename)


# Load datasets when the application starts.
AQI = load_aqi()
TRAFFIC = load_traffic()

EQUIPMENT = read_waste_csv(
    "b5cce8dd-b97d-4fb8-8bc3-2ff243f97aef.csv"
)

SEGREGATION = read_waste_csv(
    "d488decf-9225-46fb-bd09-03d2a86956a9.csv"
)

VEHICLES = read_waste_csv(
    "3e7c2a65-5d0f-49f7-acb3-39f5620b8bd8.csv"
)


# ---------------- BASIC ENDPOINTS ----------------

@app.get("/")
def home():
    return {
        "message": "Welcome to PunePulse AI",
        "modules": [
            "Traffic Analytics",
            "Air Quality Analytics",
            "Waste Management",
            "AI City Advisor",
            "AQI Forecasting",
            "Traffic Anomaly Detection",
        ],
        "docs": "/docs",
    }


@app.get("/api/health")
def health():
    return {
        "status": "running",
        "aqi_readings": len(AQI),
        "traffic_junctions": len(TRAFFIC),
        "waste_records": (
            len(EQUIPMENT)
            + len(SEGREGATION)
            + len(VEHICLES)
        ),
    }


@app.get("/api/overview")
def overview():
    vehicle_count = sum(
        sum(values.values())
        for values in TRAFFIC.values()
    )

    return {
        "traffic_junctions": len(TRAFFIC),
        "traffic_vehicle_counts": int(vehicle_count),
        "aqi_readings": len(AQI),
        "aqi_station_files": (
            int(AQI["station"].nunique())
            if not AQI.empty else 0
        ),
        "waste_equipment_records": len(EQUIPMENT),
        "waste_segregation_records": len(SEGREGATION),
        "waste_vehicle_records": len(VEHICLES),
    }


# ---------------- TRAFFIC ENDPOINT ----------------

@app.get("/api/traffic")
def traffic():
    result = []

    for junction, values in sorted(TRAFFIC.items()):
        result.append({
            "junction": junction,
            **values,
            "total_vehicles": sum(values.values()),
        })

    return result


# ---------------- AQI ENDPOINTS ----------------

@app.get("/api/aqi")
def aqi_summary():
    if AQI.empty:
        return {
            "stations": [],
            "message": "No AQI data found",
        }

    stations = []

    for station, group in AQI.groupby("station"):
        latest = group.loc[group["timestamp"].idxmax()]

        stations.append({
            "station_id": station,
            "station_name": station,
            "readings": int(len(group)),
            "average_reading": round(
                float(group["reading"].mean()), 2
            ),
            "latest_timestamp": latest[
                "timestamp"
            ].isoformat(),
            "latest_reading": float(latest["reading"]),
        })

    return {"stations": stations}


@app.get("/api/aqi/history")
def aqi_history(
    station: str | None = None,
    start: str | None = None,
    end: str | None = None,
    limit: int = 200,
):
    if AQI.empty:
        return []

    df = AQI.copy()

    if station:
        df = df[df["station"] == station]

    start_date = pd.to_datetime(start, errors="coerce") if start else pd.NaT
    end_date = pd.to_datetime(end, errors="coerce") if end else pd.NaT

    if pd.notna(start_date):
        df = df[df["timestamp"] >= start_date]

    if pd.notna(end_date):
        df = df[df["timestamp"] < end_date + pd.Timedelta(days=1)]

    max_rows = 100000 if (pd.notna(start_date) or pd.notna(end_date)) else 2000

    df = df.sort_values("timestamp").tail(
        max(1, min(limit, max_rows))
    )

    df["timestamp"] = df["timestamp"].dt.strftime(
        "%Y-%m-%d %H:%M:%S"
    )

    return df.to_dict(orient="records")


# ---------------- WASTE ENDPOINT ----------------

@app.get("/api/waste")
def waste_summary():
    result = {
        "equipment_records": len(EQUIPMENT),
        "segregation_records": len(SEGREGATION),
        "vehicle_records": len(VEHICLES),
    }

    if not SEGREGATION.empty:
        waste_col = "Waste quantity (Tonnes Per Day)"
        households_col = "Number of HH"
        segregating_col = (
            "No. of Households with waste segregation"
        )

        if waste_col in SEGREGATION.columns:
            result["reported_waste_tonnes_per_day"] = round(
                float(
                    safe_number(
                        SEGREGATION[waste_col]
                    ).sum()
                ), 2
            )

        if households_col in SEGREGATION.columns:
            result["reported_households"] = int(
                safe_number(
                    SEGREGATION[households_col]
                ).sum()
            )

        if (
            households_col in SEGREGATION.columns
            and segregating_col in SEGREGATION.columns
        ):
            households = safe_number(
                SEGREGATION[households_col]
            ).sum()

            segregating = safe_number(
                SEGREGATION[segregating_col]
            ).sum()

            result["reported_segregation_percent"] = (
                round(
                    float(100 * segregating / households), 2
                )
                if households > 0 else None
            )

    if not EQUIPMENT.empty:
        bins_col = "Bins-No of street bins"

        if bins_col in EQUIPMENT.columns:
            result["reported_street_bins"] = int(
                safe_number(EQUIPMENT[bins_col]).sum()
            )

    return result


# ---------------- AI FEATURE 1: AQI FORECAST ----------------

def aqi_forecast():
    if AQI.empty or len(AQI) < 30:
        return {
            "available": False,
            "reason": (
                "At least 30 historical readings are required."
            ),
            "forecast": [],
        }

    df = AQI[["timestamp", "reading"]].copy()
    df = df.dropna().sort_values("timestamp")

    daily = (
        df.set_index("timestamp")["reading"]
        .resample("D")
        .mean()
        .dropna()
    )

    if len(daily) < 20:
        return {
            "available": False,
            "reason": (
                "Not enough distinct daily readings "
                "for forecasting."
            ),
            "forecast": [],
        }

    values = daily.to_numpy(dtype=float)
    X, y = [], []

    for i in range(7, len(values)):
        X.append([
            *values[i - 7:i],
            i % 7,
            i % 12,
        ])
        y.append(values[i])

    X = np.asarray(X)
    y = np.asarray(y)

    if len(X) < 12:
        return {
            "available": False,
            "reason": "Not enough training samples.",
            "forecast": [],
        }

    split = max(1, int(len(X) * 0.8))

    model = RandomForestRegressor(
        n_estimators=120,
        max_depth=5,
        random_state=42,
    )

    model.fit(X[:split], y[:split])

    validation = (
        model.predict(X[split:])
        if split < len(X) else []
    )

    mae = None
    rmse = None
    baseline_mae = None
    test_days = 0

    if len(validation):
        actual = y[split:]
        errors = validation - actual
        mae = float(np.mean(np.abs(errors)))
        rmse = float(np.sqrt(np.mean(errors ** 2)))
        previous_day = X[split:, 6]
        baseline_mae = float(np.mean(np.abs(previous_day - actual)))
        test_days = int(len(actual))

    rolling = list(values[-7:])
    last_date = daily.index[-1]
    forecasts = []

    for step in range(1, 8):
        index = len(values) + step - 1

        features = np.asarray([[
            *rolling[-7:],
            index % 7,
            index % 12,
        ]])

        prediction = max(
            0.0,
            float(model.predict(features)[0]),
        )

        future_date = last_date + pd.Timedelta(days=step)

        forecasts.append({
            "date": future_date.strftime("%Y-%m-%d"),
            "predicted_reading": round(prediction, 2),
        })

        rolling.append(prediction)

    return {
        "available": True,
        "model": "Random Forest Regressor",
        "training_points": int(split),
        "validation_mae": (
            round(mae, 2) if mae is not None else None
        ),
        "validation_rmse": (
            round(rmse, 2) if rmse is not None else None
        ),
        "baseline_mae": (
            round(baseline_mae, 2) if baseline_mae is not None else None
        ),
        "test_days": test_days,
        "forecast": forecasts,
        "note": (
            "Experimental forecast based on historical data. "
            "It is not an official AQI warning."
        ),
    }


@app.get("/api/aqi/forecast")
@app.get("/api/forecast")
def get_aqi_forecast():
    result = aqi_forecast()

    return {
        **result,
        "data": result.get("forecast", []),
    }


# ---------------- AI FEATURE 2: TRAFFIC ANOMALIES ----------------

def traffic_analysis():
    rows = []

    for junction, counts in TRAFFIC.items():
        row = {
            "junction": junction,
            **counts,
            "total_vehicles": sum(
                float(counts.get(vehicle, 0))
                for vehicle in [
                    "car", "motorbike", "bus", "truck"
                ]
            ),
        }

        rows.append(row)

    rows.sort(
        key=lambda item: item["total_vehicles"],
        reverse=True,
    )

    features = [
        [
            row.get(vehicle, 0)
            for vehicle in [
                "car", "motorbike", "bus", "truck"
            ]
        ]
        for row in rows
    ]

    anomaly_labels = {}
    anomaly_scores = {}

    if len(features) >= 5:
        matrix = np.asarray(features, dtype=float)

        model = IsolationForest(
            contamination="auto",
            random_state=42,
        )

        labels = model.fit_predict(matrix)
        scores = model.decision_function(matrix)

        for i, row in enumerate(rows):
            anomaly_labels[row["junction"]] = bool(
                labels[i] == -1
            )

            anomaly_scores[row["junction"]] = round(
                float(scores[i]), 3
            )

    maximum = max(
        (row["total_vehicles"] for row in rows),
        default=0,
    )

    results = []

    for row in rows:
        ratio = (
            row["total_vehicles"] / maximum * 100
            if maximum else 0
        )

        results.append({
            **row,
            "relative_load_percent": round(ratio, 1),
            "level": (
                "High relative load" if ratio >= 75
                else "Moderate relative load" if ratio >= 40
                else "Lower relative load"
            ),
            "ml_anomaly": anomaly_labels.get(
                row["junction"], False
            ),
            "anomaly_score": anomaly_scores.get(
                row["junction"]
            ),
        })

    return results


@app.get("/api/traffic/analysis")
def get_traffic_analysis():
    return traffic_analysis()


@app.get("/api/traffic/anomalies")
@app.get("/api/ai/anomalies")
def get_traffic_anomalies():
    results = traffic_analysis()

    return [
        row for row in results
        if row["ml_anomaly"]
    ]


# ---------------- AI FEATURE 3: CITY INSIGHTS ----------------

def build_insights():
    traffic_results = traffic_analysis()
    forecast = aqi_forecast()

    latest_aqi = None
    trend = "unavailable"

    if not AQI.empty:
        daily = (
            AQI.set_index("timestamp")["reading"]
            .resample("D")
            .mean()
            .dropna()
        )

        if not daily.empty:
            latest_aqi = round(
                float(daily.iloc[-1]), 2
            )

            if len(daily) >= 7:
                recent = float(daily.tail(3).mean())
                previous = float(daily.iloc[-7:-3].mean())

                if recent > previous * 1.05:
                    trend = "rising"
                elif recent < previous * 0.95:
                    trend = "falling"
                else:
                    trend = "mostly stable"
            else:
                trend = "limited history"

    recommendations = []

    if traffic_results:
        busiest = traffic_results[0]

        recommendations.append({
            "title": "Prioritise traffic review",
            "priority": "High",
            "detail": (
                f"{busiest['junction']} has the largest "
                "accumulated vehicle count in the supplied "
                "dataset. Review signal timing and peak-hour "
                "observations there first."
            ),
            "basis": (
                "Historical vehicle-count ranking, not a live "
                "congestion measurement."
            ),
        })

    if latest_aqi is not None:
        recommendations.append({
            "title": "Air-quality monitoring",
            "priority": (
                "High" if trend == "rising" else "Medium"
            ),
            "detail": (
                "Recent readings are increasing. Check station "
                "data and consider targeted emissions monitoring."
                if trend == "rising"
                else "Continue tracking readings to understand "
                "longer-term air-quality patterns."
            ),
            "basis": (
                f"Latest pooled daily mean: {latest_aqi}; "
                f"observed trend: {trend}."
            ),
        })

    if not SEGREGATION.empty:
        household_col = "Number of HH"
        segregation_col = (
            "No. of Households with waste segregation"
        )

        if (
            household_col in SEGREGATION.columns
            and segregation_col in SEGREGATION.columns
        ):
            households = safe_number(
                SEGREGATION[household_col]
            ).sum()

            segregating = safe_number(
                SEGREGATION[segregation_col]
            ).sum()

            if households > 0:
                percentage = (
                    segregating / households * 100
                )

                recommendations.append({
                    "title": "Waste segregation coverage",
                    "priority": "Medium",
                    "detail": (
                        f"The supplied data reports a segregation "
                        f"ratio of {percentage:.1f}%. Investigate "
                        "areas with lower coverage when ward-level "
                        "records are available."
                    ),
                    "basis": (
                        "Calculated from supplied household totals; "
                        "not necessarily a deduplicated city-wide rate."
                    ),
                })

    return {
        "traffic_ranking": traffic_results[:8],
        "aqi": {
            "latest_daily_mean": latest_aqi,
            "trend": trend,
        },
        "aqi_forecast": forecast,
        "recommendations": recommendations,
        "methods": [
            "Random Forest regression for experimental AQI forecasting.",
            "Isolation Forest for unusual traffic-count patterns.",
            "Evidence-linked rules for readable city recommendations.",
        ],
    }


@app.get("/api/ai/insights")
def ai_insights():
    return build_insights()


# ---------------- AI CITY ADVISOR ----------------

def generate_city_answer(question: str):
    q = question.lower().strip()
    insights = build_insights()

    traffic_results = insights["traffic_ranking"]
    aqi = insights["aqi"]
    forecast = insights["aqi_forecast"]

    if any(word in q for word in [
        "traffic", "junction", "congestion", "vehicle", "busy"
    ]):
        if not traffic_results:
            answer = (
                "No traffic records were found in the supplied dataset."
            )
        else:
            busiest = traffic_results[0]

            answer = (
                f"{busiest['junction']} has the highest accumulated "
                f"vehicle count ({int(busiest['total_vehicles']):,}). "
                "This is a historical ranking, not live congestion."
            )

    elif any(word in q for word in [
        "forecast", "predict", "tomorrow", "future"
    ]):
        if forecast["available"]:
            answer = (
                "The experimental seven-day Random Forest forecast "
                "is available. It uses historical daily readings and "
                "should not be treated as an official AQI warning."
            )
        else:
            answer = (
                "A forecast is not available: "
                + forecast["reason"]
            )

    elif any(word in q for word in [
        "air", "aqi", "pollution", "quality"
    ]):
        answer = (
            f"The latest pooled daily reading mean is "
            f"{aqi['latest_daily_mean']}; the recent trend is "
            f"{aqi['trend']}. Confirm the units and station mapping "
            "before interpreting it as official AQI."
        )

    elif any(word in q for word in [
        "waste", "segregation", "bin", "garbage"
    ]):
        match = next(
            (
                item
                for item in insights["recommendations"]
                if "Waste" in item["title"]
            ),
            None,
        )

        answer = (
            match["detail"] if match
            else "The waste dataset lacks enough usable fields "
                 "for this analysis."
        )

    else:
        answer = (
            "I can analyse traffic hotspots, air-quality trends, "
            "experimental AQI forecasts, and waste-segregation "
            "indicators. Try asking: Which junction has the most traffic?"
        )

    return {
        "question": question,
        "answer": answer,
        "source": "PunePulse datasets and exploratory ML analysis",
        "is_live_data": False,
    }


@app.get("/api/ai/ask")
def ai_ask(question: str):
    return generate_city_answer(question)


@app.post("/api/ai/ask")
def ai_ask_post(payload: dict):
    question = str(payload.get("question", "")).strip()

    if not question:
        return {
            "question": "",
            "answer": "Please enter a question about Pune's city data.",
            "source": "PunePulse",
            "is_live_data": False,
        }

    return generate_city_answer(question)

TRAFFIC_FLOW_CACHE = DATA / "traffic" / "flow_5min.csv"
VEHICLE_TYPES = ["car", "motorbike", "bus", "truck"]


def build_traffic_flow():
    if TRAFFIC_FLOW_CACHE.exists():
        cached = read_csv_safe(TRAFFIC_FLOW_CACHE)

        if not cached.empty:
            return cached

    folder = DATA / "traffic" / "extracted" / "traffic"

    if not folder.exists():
        return pd.DataFrame()

    print("Building 5-minute traffic flow (first run only)...")

    files = list(folder.rglob("*.csv"))
    full_files = [f for f in files if not f.stem.endswith("_one")]
    files = full_files or files

    frames = []

    for file in files:
        try:
            df = pd.read_csv(file)

            if not {"Time", "Direction"}.issubset(df.columns):
                continue

            df = df.dropna(subset=["Time", "Direction"]).copy()

            for vehicle in VEHICLE_TYPES:
                if vehicle not in df.columns:
                    df[vehicle] = 0

                df[vehicle] = safe_number(df[vehicle]).fillna(0)

            times = df["Time"].astype(str)
            hours = safe_number(times.str[:2])
            minutes = safe_number(times.str[3:5])

            df["bucket"] = hours * 60 + (minutes // 5) * 5
            df = df.dropna(subset=["bucket"])

            grouped = df.groupby(
                ["Direction", "bucket"]
            )[VEHICLE_TYPES].max()

            flow = (
                grouped.groupby(level=0).diff()
                .fillna(grouped)
                .clip(lower=0)
            )

            flow = flow.groupby(level="bucket").sum().reset_index()

            if len(flow) > 4:
                flow = flow.iloc[1:-1]

            flow["junction"] = file.relative_to(folder).parts[0]
            flow["session"] = file.stem

            frames.append(flow)

        except (OSError, ValueError, pd.errors.ParserError) as exc:
            print(f"Traffic flow file skipped: {file.name}: {exc}")

    if not frames:
        return pd.DataFrame()

    result = pd.concat(frames, ignore_index=True)
    result["bucket"] = result["bucket"].astype(int)
    result["total"] = result[VEHICLE_TYPES].sum(axis=1)

    result.to_csv(TRAFFIC_FLOW_CACHE, index=False)

    return result


TRAFFIC_FLOW = build_traffic_flow()


def traffic_ai_anomalies():
    flow = TRAFFIC_FLOW

    if flow.empty or len(flow) < 50:
        return {
            "available": False,
            "reason": "Not enough traffic time-series data.",
            "junctions": [],
            "anomalies": [],
        }

    contamination = 0.03
    anomalies = []
    junctions = []

    for junction, part in flow.groupby("junction"):
        part = part.reset_index(drop=True)

        if len(part) < 30:
            continue

        matrix = part[VEHICLE_TYPES].to_numpy(dtype=float)

        model = IsolationForest(
            n_estimators=200,
            contamination=contamination,
            random_state=42,
        )

        labels = model.fit_predict(matrix)
        scores = model.decision_function(matrix)

        means = matrix.mean(axis=0)
        stds = matrix.std(axis=0)
        stds[stds == 0] = 1
        z_scores = (matrix - means) / stds

        points = []

        for i, row in part.iterrows():
            minute = int(row["bucket"])
            is_anomaly = bool(labels[i] == -1)

            point = {
                "time": f"{minute // 60:02d}:{minute % 60:02d}",
                "minute": minute,
                "total": int(row["total"]),
                "session": str(row["session"]),
                "anomaly": is_anomaly,
                "score": round(float(scores[i]), 3),
            }

            points.append(point)

            if is_anomaly:
                k = int(np.argmax(np.abs(z_scores[i])))
                direction = "above" if z_scores[i][k] > 0 else "below"

                anomalies.append({
                    **point,
                    "junction": junction,
                    "reason": (
                        f"{VEHICLE_TYPES[k]} count is {direction} normal "
                        f"({z_scores[i][k]:+.1f} std)"
                    ),
                })

        junctions.append({
            "junction": junction,
            "average_total": round(float(part["total"].mean()), 1),
            "points": points,
        })

    anomalies.sort(key=lambda item: item["score"])

    return {
        "available": True,
        "model": "Isolation Forest",
        "contamination": contamination,
        "buckets_analysed": int(len(flow)),
        "anomaly_count": len(anomalies),
        "junctions": junctions,
        "anomalies": anomalies[:10],
    }


@app.get("/api/traffic/ai-anomalies")
def get_traffic_ai_anomalies():
    return traffic_ai_anomalies()