import pymysql
from db_manager import MySQLManager
import pandas as pd

create_table_sql = """
CREATE TABLE `douban_movies` (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '主键编号',
  `movie_id` varchar(20) NOT NULL COMMENT '电影编号(豆瓣ID)',
  `title` varchar(255) NOT NULL COMMENT '电影名称',
  `pub_date` int(11) DEFAULT NULL COMMENT '年份',
  `score` decimal(3,1) DEFAULT NULL COMMENT '评分(保留1位小数)',
  `image` text COMMENT '图片URL',
  `actors` varchar(255) DEFAULT NULL COMMENT '主演(可能很长)',
  `regions` varchar(100) DEFAULT NULL COMMENT '发布地区',
  `movie_type` varchar(255) DEFAULT NULL COMMENT '电影类型',
  `comment_num` int(11) DEFAULT NULL COMMENT '评论数(数字类型)',
  `comment` text COMMENT '评论',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_movie_id` (`movie_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='豆瓣电影数据表';
"""
# csv中的数据列名
COLUMNS = [
    'movie_id', 'title', 'countries', 'genres', 'directors', 'actors',
    'year', 'rating', 'star_count', 'comment_count',
    'comment', 'poster', 'user_avatar', 'user_name', 'rank',
]
# 表中的数据列名
# 数据库中实际存在的所有列名（13个）
all_db_columns = [
    'id', 'movie_id', 'title', 'pub_date', 'score', 'image', 
    'actors', 'regions', 'movie_type', 'comment_num', 'comment', 
    'created_at', 'updated_at'
]

def create_table(name:str):
    with MySQLManager() as db:
        db.create_table(name, create_table_sql)

def  insert_movie_data(movie_data: pd.DataFrame):
    with MySQLManager() as db:
        db.save_dataframe(movie_data, 'douban_movies', if_exists='append')

if __name__ == '__main__':
    create_table('douban_movies')
    df = pd.read_csv('./data/movie_data_clean.csv', usecols=COLUMNS)
    df.rename(
        columns={
            'year': 'pub_date',
            'rating': 'score',
            'poster': 'image',
            'countries': 'regions',
            'genres': 'movie_type',
            'comment_count': 'comment_num'
        },
        inplace=True
    )
    df.drop(columns=['directors', 'user_avatar', 'user_name', 'rank', 'star_count'], inplace=True)
    insert_movie_data(df)