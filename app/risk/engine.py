from dataclasses import dataclass, asdict


@dataclass
class RiskAssessment:
    level: str
    score: int
    reasons: list[str]
    recommended_checks: list[str]
    disclaimer: str = (
        "Prototype screening indicator only. Not a validated grain-spoilage forecast "
        "or food-safety determination."
    )


def assess_reading(
    temperature_c: float,
    relative_humidity_pct: float,
    co2_ppm: float | None = None,
    grain_moisture_pct: float | None = None,
) -> dict:
    """Transparent provisional screening score; thresholds require expert calibration."""
    score = 0
    reasons = []
    checks = []

    if temperature_c >= 35:
        score += 35
        reasons.append("High temperature reading (>=35 degrees C).")
        checks.append("Verify the reading with a calibrated reference thermometer.")
    elif temperature_c >= 30:
        score += 20
        reasons.append("Elevated temperature reading (30-34.9 degrees C).")
    elif temperature_c >= 25:
        score += 8
        reasons.append("Temperature is within the watch band (25-29.9 degrees C).")

    if relative_humidity_pct >= 80:
        score += 40
        reasons.append("Very high interstitial relative-humidity reading (>=80%).")
        checks.append(
            "Confirm sensor placement and inspect grain moisture using an approved method."
        )
    elif relative_humidity_pct >= 70:
        score += 25
        reasons.append("Elevated interstitial relative-humidity reading (70-79.9%).")
    elif relative_humidity_pct >= 60:
        score += 10
        reasons.append("Relative humidity is within the watch band (60-69.9%).")

    if co2_ppm is not None:
        if co2_ppm >= 2000:
            score += 25
            reasons.append(
                "CO2 is elevated (>=2000 ppm); investigate possible respiration or ventilation effects."
            )
            checks.append(
                "Check CO2 sensor calibration and compare adjacent sensor positions."
            )
        elif co2_ppm >= 1200:
            score += 10
            reasons.append("CO2 is above the provisional watch level (1200-1999 ppm).")

    if grain_moisture_pct is not None:
        if grain_moisture_pct >= 14.5:
            score += 25
            reasons.append(
                "Measured grain moisture is elevated (>=14.5%); grain-specific limits must be confirmed."
            )
            checks.append(
                "Take a representative grain sample and verify moisture with a calibrated meter."
            )
        elif grain_moisture_pct >= 13.5:
            score += 10
            reasons.append(
                "Grain moisture is within the provisional watch band (13.5-14.4%)."
            )

    score = min(score, 100)

    level = (
        "critical" if score >= 70
        else "high" if score >= 45
        else "moderate" if score >= 20
        else "low"
    )

    if not reasons:
        reasons.append("No provisional screening thresholds were crossed.")

    if not checks:
        checks.append(
            "Continue routine monitoring and compare trends across sensor positions."
        )

    return asdict(RiskAssessment(level, score, reasons, checks))
