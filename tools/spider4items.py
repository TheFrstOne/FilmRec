
import os
import requests
import json
import time
import random
import csv


headers = {
    "accept": "application/json, text/plain, */*",
    "accept-language": "zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6",
    "cache-control": "no-cache",
    "origin": "https://movie.douban.com",
    "pragma": "no-cache",
    "priority": "u=1, i",
    "referer": "https://movie.douban.com/explore",
    "sec-ch-ua": "\"Chromium\";v=\"154\", \"Microsoft Edge\";v=\"154\", \"Not A(Brand\";v=\"99\"",
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": "\"Windows\"",
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-site",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36 Edg/154.0.0.0"
}
cookies = {
    "bid": "hrlzOoWwoF8",
    "ll": "\"118254\"",
    "__utma": "30149280.2117315757.1782117151.1782117151.1791294122.2",
    "__utmc": "30149280",
    "__utmz": "30149280.1791294122.2.2.utmcsr=cn.bing.com|utmccn=(referral)|utmcmd=referral|utmcct=/",
    "__utmb": "30149280.1.10.1791294122",
    "ap_v": "0,6.0"
}
url = 'https://m.douban.com/rexxar/api/v2/movie/recommend'
csv_file = './data/movie_data.csv'
fieldnames = [
    'movie_id', 'title', 'subtitle', 'year', 'rating', 
    'star_count', 'comment_count', 'comment', 'poster', 
    'user_avatar', 'user_name', 'rank'
]

def fetch_movie_data(tags, start):
    selected_categories = f'{{"类型":"{tags}"}}'
    params = {
        "refresh": "0",
        "start": f"{start}",
        "count": "20",
        "selected_categories": selected_categories,
        "uncollect": "false",
        "score_range": "0,10",
        "tags": f"{tags}"
    }
    response = requests.get(url, headers=headers, cookies=cookies, params=params)
    data = json.loads(response.text)
    feeds = data['items']
    file_exsits = os.path.exists(csv_file)
    with open(csv_file, 'a',newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        if not file_exsits:
            writer.writeheader()
        for feed in feeds:
             # ⚠️ 防坑提示1：跳过第一条榜单信息（没有 rating 和 comment）
            if feed.get('card') != 'subject':
                continue
            # ⚠️ 防坑提示2：安全提取嵌套字典，防止报错
            rating = feed.get('rating', {})
            comment = feed.get('comment', {})
            user = comment.get('user', {})
            pic = feed.get('pic', {})
            honor_infos = feed.get('honor_infos', [])

            # 构建数据字典（完全按照你截图的字段映射）
            movie_data = {
                'movie_id': feed.get('id'),
                'title': feed.get('title'),
                'subtitle': feed.get('card_subtitle'),
                'year': feed.get('year'),
                'rating': rating.get('value'),
                'star_count': rating.get('star_count'),
                'comment_count': rating.get('count'),
                'comment': comment.get('comment', '').replace('\n', ' '), # 去除换行符
                'poster': pic.get('large'),
                'user_avatar': user.get('avatar'),
                'user_name': user.get('name'),
                # 排行榜排名，如果有 honor_infos 才取第一个的 rank
                'rank': honor_infos[0].get('rank') if honor_infos else None
            }

            writer.writerow(movie_data)


if __name__ == '__main__':
    tags = ["喜剧", "爱情", "动作", "科幻", "动画", "悬疑", "犯罪", "音乐", "历史", "奇幻", "恐怖", "战争", "传记", "歌舞", "武侠", "纪录片", "短片"]
    for tag in tags:
        for i in range(1,20):
            x = i*20
            fetch_movie_data(tag, x)
            random_sleep = random.randint(1, 3)
            time.sleep(random_sleep)
        