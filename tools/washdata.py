# -*- coding: utf-8 -*-
"""
movie_data.csv 数据清洗脚本

清洗内容：
1. subtitle 列：原始格式固定为 "年份 / 国家 / 类型 / 导演 / 主演"，整列按位置拆成
   国家 / 类型 / 导演 / 主演 四个结构化字段后，subtitle 本身不再保留（年份段和 year 列重复）。
   subtitle 里人名先导演后主演，所以第 4 段是导演、第 5 段是主演，不靠姓名猜身份。
2. 整表空值与脏数据：
   - 所有文本列去换行、去首尾空白、压缩连续空白
   - rank 的 NaN 表示"未上榜"，填 0
   - rating / star_count / comment_count 为 0 表示豆瓣暂无数据，按缺失处理后整行丢弃
   - 关键字段缺失的行直接丢弃
   - 按 movie_id 去重（同一部电影被不同标签页重复抓到，保留评论数最多的一条）
3. 结果写入 movie_data_clean.csv，不修改原始文件

运行：python washdata.py
"""

import re

import pandas as pd

RAW_CSV = './data/movie_data.csv'
CLEAN_CSV = './data/movie_data_clean.csv'

VALUE_SEP = '|'    # 多值字段内部的分隔符，如 "剧情|喜剧"

# 需要做空白清理的文本列（subtitle 也要清理，拆完就丢弃）
TEXT_COLS = ['title', 'subtitle', 'comment', 'poster', 'user_avatar', 'user_name']

# 这些字段缺失就认为这条记录没有使用价值，整行丢弃
# （subtitle 在拆列之前用，拆完就删，见 clean_data）
CORE_COLS = ['movie_id', 'title', 'subtitle', 'year', 'rating', 'poster']

# 0 代表"豆瓣暂无数据"的数值列
ZERO_AS_MISSING = ['rating', 'star_count', 'comment_count']

# 最终输出的列顺序
COLUMNS = [
    'movie_id', 'title', 'countries', 'genres', 'directors', 'actors',
    'year', 'rating', 'star_count', 'comment_count',
    'comment', 'poster', 'user_avatar', 'user_name', 'rank',
]

_WS_RE = re.compile(r'[\s　\xa0]+')  # 普通空白、全角空格、不换行空格


def _clean_text(value):
    """把换行、制表符、连续空白压成单个空格，并去掉首尾空白。"""
    # 爬下来的数据可能会有Nan，不能直接操作，防御性判断一下
    if not isinstance(value, str):
        return value
    return _WS_RE.sub(' ', value).strip()

def _split_subtitle(raw):
    """拆 subtitle，返回去掉空片段后的列表；超过 5 段时把多余部分并入主演。"""
    # 依旧防御，因为 subtitle 可能是 NaN 或空字符串
    if not isinstance(raw, str) or not raw.strip():
        return []
    # 先按斜杠拆，再去掉空片段，最后超过 5 段的把多余部分并入主演
    parts = [p.strip() for p in raw.split('/')]
    parts = [p for p in parts if p]
    if len(parts) > 5:
        parts = parts[:4] + [' '.join(parts[4:])]
    return parts


def _join_values(segment):
    """把 "美国 法国" 变成 "美国|法国"，重复值只保留一次。"""
    #dict.fromkeys() 可以去重并保持顺序，最后用 VALUE_SEP 拼接
    '''
    segment.split()
    unique_values = list(dict.fromkeys(segment.split()))
    return VALUE_SEP.join(unique_values)
    '''
    return VALUE_SEP.join(dict.fromkeys(segment.split()))


def parse_subtitle(subtitles):
    """
    把 subtitle 按固定段序拆成结构化字段（不含 subtitle 本身），返回与输入等长的 DataFrame。

    第 1 段年份（和 year 列重复，不保留）、第 2 段国家、第 3 段类型、
    第 4 段导演、第 5 段主演；只有 4 段的行说明缺主演，actors 留空。
    """
    records = []
    for raw in subtitles:
        parts = _split_subtitle(raw)
        rec: dict[str, object] = {
            'countries': pd.NA, 'genres': pd.NA, 'directors': pd.NA, 'actors': pd.NA,
        }

        if len(parts) >= 2:
            rec['countries'] = _join_values(parts[1])
        if len(parts) >= 3:
            rec['genres'] = _join_values(parts[2])
        if len(parts) == 4:
            rec['actors'] = _join_values(parts[3])
        if len(parts) >= 5:
            rec['directors'] = _join_values(parts[3])
            rec['actors'] = _join_values(parts[4])

        records.append(rec)

    return pd.DataFrame(records, index=subtitles.index)


def clean_data(df):
    """
    清洗整个 DataFrame：文本归一化 -> 空值处理 -> subtitle 拆分并丢弃 -> 去重 -> 类型修正。

    Parameters:
        df (pd.DataFrame): 原始 DataFrame

    Returns:
        pd.DataFrame: 清洗后的 DataFrame
    """
    # 1. 文本列归一化：去换行、去首尾空白、压缩连续空白
    for col in TEXT_COLS:
        df[col] = df[col].map(_clean_text)

    # 2. 数值列的 0 表示豆瓣暂无数据，按缺失处理
    for col in ZERO_AS_MISSING:
        df[col] = df[col].mask(df[col] == 0)

    # 3. 关键字段缺失的整行丢弃（此时 subtitle 还没拆，用它判断这条记录是否有效）
    df = df.dropna(subset=CORE_COLS)

    # 4. subtitle 拆成结构化字段后整列丢弃，年份段和 year 列重复，不用保留
    parsed = parse_subtitle(df['subtitle'])
    df = pd.concat([df.drop(columns=['subtitle']), parsed], axis=1)

    # 5. 按 movie_id 去重：同一部电影被不同标签页重复抓到，
    #    除 comment_count 外字段完全相同，保留评论数最多（最新）的一条
    df = df.sort_values('comment_count', ascending=False, kind='stable')
    df = df.drop_duplicates(subset='movie_id', keep='first')

    # 6. rank 的 NaN 表示"未上榜"，填 0，并统一数值类型
    df['rank'] = df['rank'].fillna(0).astype(int)
    df['movie_id'] = df['movie_id'].astype(int)
    df['year'] = df['year'].astype(int)
    df['comment_count'] = df['comment_count'].astype(int)
    df['rating'] = df['rating'].astype(float).round(1)
    df['star_count'] = df['star_count'].astype(float).round(1)

    # 7. 固定列顺序并重置索引
    df = df[COLUMNS].reset_index(drop=True)
    return df


if __name__ == '__main__':
    raw_df = pd.read_csv(RAW_CSV)
    clean_df = clean_data(raw_df)

    # utf-8-sig 带 BOM，Windows 下用 Excel 打开中文不乱码
    clean_df.to_csv(CLEAN_CSV, index=False, encoding='utf-8-sig')
