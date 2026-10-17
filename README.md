# PunePulse : AI-Powered Smart City Analytics

PunePulse is a smart city analytics project focused on understanding urban challenges in Pune using data analytics, interactive visualizations, and machine learning. It brings together traffic, air quality, and waste management data in a single dashboard to make city-level insights easier to explore.

## Features

- **City Overview:** A unified dashboard displaying key urban indicators.
- **Traffic Analytics:** Explore vehicle counts and traffic-related data.
- **Air Quality Monitoring:** Analyze AQI readings from different monitoring stations.
- **Waste Management:** Explore available waste collection and segregation data.
- **Interactive Visualizations:** View data through charts and dashboard components.
- **AI-Based Analysis:** Integrate machine learning to explore patterns and generate data-driven insights.

## Tech Stack

- **Frontend:** HTML, CSS, JavaScript, Chart.js
- **Backend:** Python, FastAPI
- **Data Analysis:** Pandas, NumPy
- **Machine Learning:** Scikit-learn
- **Data Format:** CSV

## Project Structure

```text
PunePulse/
├── backend/
├── frontend/
├── datasets/
│   ├── aqi/
│   ├── traffic/
│   └── waste/
├── requirements.txt
├── .gitignore
└── README.md
```

## Getting Started

### Prerequisites

- Python 3.10 or later
- pip
- A modern web browser

### Installation

**1. Clone the repository**

```bash
git clone https://github.com/YOUR-USERNAME/punepulse.git
cd punepulse
```

Replace `YOUR-USERNAME` with your GitHub username.

**2. Create a virtual environment**

```bash
python -m venv .venv
```

Activate it on Windows:

```bash
.venv\Scripts\activate
```

**3. Install dependencies**

```bash
pip install -r requirements.txt
```

**4. Start the backend**

```bash
uvicorn backend.main:app --reload
```

**5. Launch the frontend**

Open the frontend's `index.html` file using VS Code Live Server, or run:

```bash
python -m http.server 5500 --directory frontend
```

Visit `http://127.0.0.1:5500` in your browser.

The backend API runs at `http://127.0.0.1:8000`. Interactive API documentation is available at `http://127.0.0.1:8000/docs`.

*Note: These commands assume the backend entry point is `backend/main.py` and the frontend files are inside `frontend/`. Adjust them if your repository uses a different structure.*

## Datasets

PunePulse uses CSV datasets related to:

- Traffic and vehicle counts
- Air quality readings
- Waste collection and segregation

The dashboard's results depend on the coverage, quality, and availability of these datasets. The project does not necessarily represent real-time city conditions.

## Project Goals

- Bring multiple urban datasets into one dashboard.
- Identify useful patterns in traffic, air quality, and waste management.
- Explore how machine learning can support data-driven urban analysis.
- Build a foundation for extending the platform to other Indian cities.

## Future Scope

- Integrate regularly updated data from reliable sources.
- Improve predictive models and evaluate their performance.
- Add geographic maps and location-based insights.
- Extend support to additional cities and urban indicators.

## Limitations

- Results depend on the supplied datasets.
- Historical or incomplete records may affect the analysis.
- Model outputs require validation before real-world use.

## License

No license has been specified yet. All rights remain with their respective owners unless a license is added.
