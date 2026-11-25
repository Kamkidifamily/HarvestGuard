from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    app_name: str = "HarvestGuard"
    environment: str = "development"
    database_url: str = "sqlite:///./harvestguard.db"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()
