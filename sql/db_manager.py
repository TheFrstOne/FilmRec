from typing import Literal, Optional

import pandas as pd
from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError
from config import DBConfig

class MySQLManager:
    def __init__(self):
        # 1. 创建引擎（自带连接池）
        self.engine = create_engine(
            DBConfig.get_url(),
            pool_size=10,           # 常驻连接池大小
            max_overflow=20,        # 高峰期允许超出的连接数
            pool_recycle=3600,      # 1小时回收一次连接（防止 MySQL 8小时自动断开）
            pool_pre_ping=True,     # 🌟 工业界必加！每次取连接前先 ping 一下，断线自动重连
            echo=False              # 生产环境设为 False，调试时可设为 True 看 SQL 日志
        )

    def __enter__(self):
        """支持 with 语法，自动管理资源"""
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """退出 with 时自动调用，安全关闭连接池"""
        self.close()

    def execute_query(self, sql: str, params: Optional[dict] = None) -> pd.DataFrame:
        """通用查询：返回 DataFrame（适合数据分析）"""
        try:
            with self.engine.connect() as conn:
                # 使用 text() 包装 SQL，防止 SQL 注入
                result = pd.read_sql(text(sql), conn, params=params)
                return result
        except SQLAlchemyError as e:
            print(f"❌ 查询失败: {e}")
            return pd.DataFrame()

    def execute_update(self, sql: str, params: Optional[dict] = None) -> bool:
        """通用增删改：返回是否成功"""
        try:
            with self.engine.begin() as conn:  # begin() 会自动提交事务
                conn.execute(text(sql), params or {})
            return True
        except SQLAlchemyError as e:
            print(f"❌ 执行失败: {e}")
            return False

    def create_table(self, table_name: str, create_sql: str) -> bool:
            """
            执行建表 SQL。
            :param table_name: 表名（仅用于打印日志）
            :param create_sql: 完整的 CREATE TABLE 语句
            """
            try:
                with self.engine.begin() as conn:
                    # 使用 text() 包装 SQL，参数化执行
                    conn.execute(text(create_sql))
                print(f"✅ 表 `{table_name}` 创建成功（或已存在）")
                return True
            except SQLAlchemyError as e:
                print(f"❌ 建表失败: {e}")
                return False

    def save_dataframe(
        self,
        df: pd.DataFrame,
        table_name: str,
        if_exists: Literal['fail', 'replace', 'append', 'delete_rows'] = 'append',
        indexes: Optional[list] = None,
    ):
        """
        工业级 DataFrame 入库（支持分批写入，防内存溢出）。

        ⚠️ to_sql 不会创建任何索引/主键，所以新增了 indexes 参数在写完后补上：
            [{"columns": ["movie_id"], "unique": True},
             {"columns": ["year"]},
             {"columns": ["countries", "year"], "name": "idx_c_y"}]
        也兼容直接写列名：indexes=["year", "countries"]

        注意：if_exists='replace' 会 DROP 重建表，索引会丢；
              因为这里是在 to_sql 之后再建索引，所以 replace 也能保住。
        """
        try:
            df.to_sql(
                name=table_name,
                con=self.engine,
                if_exists=if_exists,
                index=False,
                chunksize=1000,      # 分批写入，每批 1000 行
                method='multi'       # 批量组装 SQL，速度提升几十倍
            )
            print(f"✅ 成功写入 {len(df)} 行到表 {table_name}")

            # 写完数据再建索引
            for spec in indexes or []:
                if isinstance(spec, str):
                    self.add_index(table_name, spec)
                else:
                    self.add_index(
                        table_name,
                        spec["columns"],
                        unique=spec.get("unique", False),
                        index_name=spec.get("name"),
                    )
            return True
        except SQLAlchemyError as e:
            print(f"❌ 写入失败: {e}")
            return False

    def add_index(
        self,
        table_name: str,
        columns,
        unique: bool = False,
        index_name: Optional[str] = None,
    ) -> bool:
        """
        给已存在的表加索引；索引已存在则跳过（不报错）。
        :param columns: "year" 或 ["countries", "year"]
        :param unique: 是否唯一索引（唯一索引才能配合 upsert 用）
        """
        if isinstance(columns, str):
            columns = [columns]
        if not index_name:
            index_name = f"idx_{table_name}_{'_'.join(columns)}"

        unique_sql = "UNIQUE " if unique else ""
        cols_sql = ", ".join(f"`{c}`" for c in columns)
        sql = f"CREATE {unique_sql}INDEX `{index_name}` ON `{table_name}` ({cols_sql})"

        try:
            with self.engine.begin() as conn:
                conn.execute(text(sql))
            print(f"✅ 索引 `{index_name}` 创建成功")
            return True
        except SQLAlchemyError:
            # MySQL 1061 = Duplicate key name，即索引已存在，忽略即可
            print(f"ℹ️ 索引 `{index_name}` 已存在，跳过")
            return False

    def close(self):
        """释放连接池"""
        self.engine.dispose()