from app.risk.engine import assess_reading

def test_normal_reading_is_low():
    result = assess_reading(22, 50, 500, 12.5)
    assert result["level"] == "low"
    assert result["score"] == 0

def test_multiple_elevated_signals_increase_risk():
    result = assess_reading(36, 85, 2500, 15.0)
    assert result["level"] == "critical"
    assert result["score"] == 100
    assert len(result["reasons"]) >= 3

def test_missing_optional_sensors_are_supported():
    result = assess_reading(31, 72)
    assert result["level"] == "high"
    assert result["score"] == 45
