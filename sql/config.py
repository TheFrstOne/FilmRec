import os
from dotenv import load_dotenv

# 加载 .env 文件
load_dotenv()

class DBConfig:
    USER = os.getenv("DB_USER")
    PASSWORD = os.getenv("DB_PASSWORD")
    HOST = os.getenv("DB_HOST", "127.0.0.1")
    PORT = os.getenv("DB_PORT", "3306")
    NAME = os.getenv("DB_NAME")

    @classmethod
    def get_url(cls):
        # 工业界强制要求加 charset=utf8mb4，防止中文乱码
        return f"mysql+pymysql://{cls.USER}:{cls.PASSWORD}@{cls.HOST}:{cls.PORT}/{cls.NAME}?charset=utf8mb4"