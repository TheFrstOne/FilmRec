import pandas as pd
from config import DBConfig
from db_manager import MySQLManager

engine = DBConfig.get_url()

# 统计每个年份的电影数量
def count_movies_by_year(df: pd.DataFrame):
    new_df = df.groupby(['year'])['movie_id'].count().reset_index(name='movies_count')
    with MySQLManager() as db:
        db.save_dataframe(df=new_df, table_name='count_by_year')
    
# 按照地区统计平均分
def count_average_score_by_region(df: pd.DataFrame):
    tmp = df[['countries', 'rating']].dropna(subset='countries').copy()
    tmp['countries'] = tmp['countries'].str.split('|')
    tmp = tmp.explode('countries')
    tmp['countries'] = tmp['countries'].str.strip()
    tmp = tmp.groupby('countries')['rating'].mean().round(2).reset_index(name='average_score').sort_values(by='average_score', ascending=False)
    with MySQLManager() as db:
        db.save_dataframe(df=tmp, table_name='average_score_by_region')
    print(tmp)

# 统计不同电影类型的数量
def count_film_by_type(df: pd.DataFrame):
    # 1. 只取需要的两列，并丢掉类型为空的行
    tmp = df[['movie_id', 'genres']].dropna(subset=['genres']).copy()
    # 2. 按 "|" 切分成 Python 列表："剧情|喜剧" -> ['剧情', '喜剧']
    tmp['genres'] = tmp['genres'].str.split('|')

    # 3. explode：把列表里的每个元素膨胀成一行
    exploded = tmp.explode('genres')

    # 4. 切分后可能出现空字符串/空格，清掉
    exploded['genres'] = exploded['genres'].str.strip()
    exploded = exploded[exploded['genres'].notna() & (exploded['genres'] != '')]

    # 5. 同一部电影如果写了重复类型，只算一次
    exploded = exploded.drop_duplicates(subset=['movie_id', 'genres'])

    # 6. 按类型分组计数，并从多到少排序
    new_df = (
        exploded.groupby('genres')['movie_id']
        .count()
        .reset_index(name='movies_count')
        .sort_values(by='movies_count', ascending=False)
        .reset_index(drop=True)
    )
    with MySQLManager() as db:
        db.save_dataframe(df=new_df, table_name='count_by_type')
    print(new_df)
    return new_df

# 评分与评论数的关系
def rating_vs_comment_count(df: pd.DataFrame):
    new_df = (
        df.dropna(subset=['rating', 'comment_count'])
        .groupby(['rating'])['comment_count'].mean().round(0)
        .reset_index(name='average_comment_count')
    )
    with MySQLManager() as db:
        db.save_dataframe(df=new_df, table_name='rating_vs_comment_count')
    return new_df

# 不同年份评分最高的电影
def top_rated_movie_by_year(df: pd.DataFrame):
    new_df = df.groupby(['year'])['rating'].idxmax()
    new_df = df.loc[new_df].reset_index(drop=True)
    with MySQLManager() as db:
        db.save_dataframe(df=new_df, table_name='top_rated_movie_by_year')
    print(new_df)
    return new_df

# 不同演员的出演次数排行
def top_actors_by_movie_count(df: pd.DataFrame):
    exploded = df['actors'].dropna().str.split('|').explode()
    exploded = exploded.str.strip()
    exploded = exploded[exploded != '']
    result = (
        exploded.to_frame(name='actor')
                .groupby('actor')
                .size()
                .sort_values(ascending=False)
                .reset_index(name='movie_count')
    )
    with MySQLManager() as db:
        db.save_dataframe(df=result, table_name='top_actors_by_movie_count')
    return result

if __name__ == '__main__':
    df = pd.read_csv('../data/movie_data_clean.csv')

    # 想先看哪个就把注释打开
    count_average_score_by_region(df)
    # count_film_by_type(df)
    # rating_vs_comment_count(df)
    # top_rated_movie_by_year(df)
    # top_actors_by_movie_count(df)