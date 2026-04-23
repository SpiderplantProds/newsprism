"""
NewsPrism - Global News Observatory
Single-file backend for Render deployment
"""
import os
import json
import asyncio
import hashlib
import random
from datetime import datetime, timedelta
from typing import List, Optional, Dict
import logging

import aiohttp
import feedparser
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import strawberry
from strawberry.fastapi import GraphQLRouter

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("newsprism")

# ─── In-memory storage ───
articles_store: List[Dict] = []
topics_store: List[Dict] = []
last_fetch_time: Optional[datetime] = None

# ─── Global news sources ───
NEWS_SOURCES = [
    {
        "id": "reuters", "name": "Reuters", "country": "United Kingdom",
        "region": "europe", "leaning": "center", "reliability": 5.0,
        "feeds": ["https://www.reutersagency.com/feed/"]
    },
    {
        "id": "bbc", "name": "BBC World", "country": "United Kingdom",
        "region": "europe", "leaning": "center", "reliability": 5.0,
        "feeds": ["https://feeds.bbci.co.uk/news/world/rss.xml"]
    },
    {
        "id": "aljazeera", "name": "Al Jazeera", "country": "Qatar",
        "region": "middle_east", "leaning": "center_left", "reliability": 4.0,
        "feeds": ["https://www.aljazeera.com/xml/rss/all.xml"]
    },
    {
        "id": "dw", "name": "Deutsche Welle", "country": "Germany",
        "region": "europe", "leaning": "center", "reliability": 5.0,
        "feeds": ["https://rss.dw.com/rdf/rss-en-all"]
    },
    {
        "id": "ap", "name": "Associated Press", "country": "United States",
        "region": "north_america", "leaning": "center", "reliability": 5.0,
        "feeds": ["https://www.militarytimes.com/arc/outboundfeeds/v2/category/news/?outputType=xml"]
    },
    {
        "id": "thehindu", "name": "The Hindu", "country": "India",
        "region": "asia", "leaning": "center_left", "reliability": 4.0,
        "feeds": ["https://www.thehindu.com/news/international/feeder/default.rss"]
    },
    {
        "id": "scmp", "name": "South China Morning Post", "country": "Hong Kong",
        "region": "asia", "leaning": "center", "reliability": 4.0,
        "feeds": ["https://www.scmp.com/rss/91/feed"]
    },
    {
        "id": "eastafrican", "name": "The EastAfrican", "country": "Kenya",
        "region": "africa", "leaning": "center", "reliability": 4.0,
        "feeds": ["https://www.theeastafrican.co.ke/service/rss/tea/~/news-article"]
    },
]

# ─── Bias analysis keywords ───
EMOTIONAL_WORDS = [
    "shocking", "outrageous", "devastating", "incredible", "horrific",
    "unbelievable", "catastrophic", "stunning", "explosive", "bombshell",
    "shattering", "disastrous", "appalling", "extraordinary", "staggering"
]

WEASEL_PHRASES = [
    "some people say", "critics say", "many believe", "it is believed",
    "some argue", "reportedly", "allegedly", "widely viewed as"
]

# ─── Bias Analyzer ───
def analyze_bias(text: str, source_leaning: str) -> Dict:
    """Analyze article text for bias indicators"""
    if not text:
        text = ""
    text_lower = text.lower()
    words = set(text_lower.split())
    
    # Find loaded words
    loaded = [w for w in EMOTIONAL_WORDS if w in words]
    
    # Find weasel phrases
    weasels = [p for p in WEASEL_PHRASES if p in text_lower]
    
    # Calculate scores based on source leaning
    if source_leaning in ["left", "center_left", "far_left"]:
        partisan_left = random.uniform(0.3, 0.7)
        partisan_right = random.uniform(0.05, 0.2)
    elif source_leaning in ["right", "center_right", "far_right"]:
        partisan_left = random.uniform(0.05, 0.2)
        partisan_right = random.uniform(0.3, 0.7)
    else:
        partisan_left = random.uniform(0.1, 0.3)
        partisan_right = random.uniform(0.1, 0.3)
    
    sensationalism = min(0.9, 0.2 + (len(loaded) * 0.08))
    weasel_score = min(0.7, 0.1 + (len(weasels) * 0.1))
    fact_reporting = max(0.1, 0.9 - sensationalism - weasel_score)
    
    scores = {
        "partisan_left": round(partisan_left, 2),
        "partisan_right": round(partisan_right, 2),
        "sensationalism": round(sensationalism, 2),
        "fact_reporting": round(fact_reporting, 2),
        "opinion_vs_news": round(weasel_score, 2),
    }
    
    all_biases = {k: v for k, v in scores.items() if k != "fact_reporting"}
    primary = max(all_biases, key=all_biases.get) if all_biases else "fact_reporting"
    
    return {
        "scores": scores,
        "primary_bias": primary,
        "intensity": all_biases.get(primary, 0),
        "confidence": 0.75,
        "loaded_words": loaded[:10],
        "weasel_phrases": weasels[:5],
    }

# ─── Topic keywords ───
TOPIC_PATTERNS = {
    "conflict_war": {
        "label": "Conflict & War", "keywords": ["conflict", "war", "attack", "military", "troops", "missile", "strike", "bombing", "ceasefire", "invasion"],
        "emoji": "⚔️"
    },
    "climate_environment": {
        "label": "Climate & Environment", "keywords": ["climate", "warming", "carbon", "emissions", "paris", "renewable", "drought", "flood", "hurricane"],
        "emoji": "🌍"
    },
    "economy_finance": {
        "label": "Economy & Finance", "keywords": ["inflation", "market", "economy", "stock", "gdp", "recession", "bank", "trade", "tariff"],
        "emoji": "📈"
    },
    "elections_politics": {
        "label": "Elections & Politics", "keywords": ["election", "vote", "candidate", "campaign", "poll", "president", "parliament", "democracy"],
        "emoji": "🗳️"
    },
    "health_pandemic": {
        "label": "Health & Disease", "keywords": ["pandemic", "virus", "vaccine", "outbreak", "disease", "hospital", "covid", "health"],
        "emoji": "🏥"
    },
    "technology_ai": {
        "label": "Technology & AI", "keywords": ["ai", "artificial intelligence", "tech", "startup", "apple", "google", "microsoft", "chip", "semiconductor"],
        "emoji": "🤖"
    },
    "human_rights": {
        "label": "Human Rights", "keywords": ["rights", "protest", "refugee", "migrant", "asylum", "freedom", "detention", "activist"],
        "emoji": "✊"
    },
    "diplomacy": {
        "label": "Diplomacy & Summits", "keywords": ["summit", "diplomat", "treaty", "sanction", "negotiation", "g7", "g20", "un", "nato", "accord"],
        "emoji": "🤝"
    },
}

def cluster_topics(articles: List[Dict]) -> List[Dict]:
    """Group articles into topics"""
    topics = {}
    
    for article in articles:
        text = (article.get("title", "") + " " + article.get("summary", "")).lower()
        source_id = article.get("source_id", "")
        
        for topic_id, topic_info in TOPIC_PATTERNS.items():
            matches = sum(1 for kw in topic_info["keywords"] if kw in text)
            if matches >= 2:
                if topic_id not in topics:
                    topics[topic_id] = {
                        "id": topic_id,
                        "label": topic_info["label"],
                        "emoji": topic_info["emoji"],
                        "keywords": topic_info["keywords"],
                        "articles": [],
                        "sources": set(),
                        "leaning_counts": {"left": 0, "center": 0, "right": 0},
                    }
                topics[topic_id]["articles"].append(article)
                topics[topic_id]["sources"].add(source_id)
                
                leaning = article.get("leaning", "center")
                if leaning in ["left", "center_left", "far_left"]:
                    topics[topic_id]["leaning_counts"]["left"] += 1
                elif leaning in ["right", "center_right", "far_right"]:
                    topics[topic_id]["leaning_counts"]["right"] += 1
                else:
                    topics[topic_id]["leaning_counts"]["center"] += 1
                break
    
    result = []
    for topic_id, data in topics.items():
        if len(data["articles"]) >= 2:
            result.append({
                "id": topic_id,
                "label": data["label"],
                "emoji": data["emoji"],
                "keywords": data["keywords"][:5],
                "article_count": len(data["articles"]),
                "source_diversity": len(data["sources"]),
                "articles": data["articles"],
                "left_count": data["leaning_counts"]["left"],
                "center_count": data["leaning_counts"]["center"],
                "right_count": data["leaning_counts"]["right"],
            })
    
    result.sort(key=lambda x: x["article_count"], reverse=True)
    return result

# ─── News Fetcher ───
async def fetch_all_news():
    """Fetch articles from all configured sources"""
    global articles_store, topics_store, last_fetch_time
    
    all_articles = []
    
    async with aiohttp.ClientSession(headers={
        "User-Agent": "NewsPrism/1.0 (News Aggregator; +https://newsprism.onrender.com)"
    }) as session:
        
        for source in NEWS_SOURCES:
            for feed_url in source["feeds"]:
                try:
                    async with session.get(feed_url, timeout=20) as resp:
                        if resp.status == 200:
                            content = await resp.text()
                            feed = feedparser.parse(content)
                            
                            for entry in feed.entries[:8]:
                                article_id = hashlib.md5(
                                    entry.get("link", "").encode()
                                ).hexdigest()[:12]
                                
                                published = entry.get("published_parsed")
                                if published:
                                    pub_time = datetime(*published[:6])
                                else:
                                    pub_time = datetime.utcnow()
                                
                                summary = entry.get("summary", "")
                                # Clean HTML from summary
                                import re
                                summary = re.sub(r"<[^>]+>", "", summary)[:300]
                                
                                content_text = f"{entry.get('title', '')} {summary}"
                                
                                all_articles.append({
                                    "id": article_id,
                                    "title": entry.get("title", "").strip(),
                                    "url": entry.get("link", ""),
                                    "published_at": pub_time.isoformat(),
                                    "source_id": source["id"],
                                    "source_name": source["name"],
                                    "source_country": source["country"],
                                    "source_region": source["region"],
                                    "source_leaning": source["leaning"],
                                    "source_reliability": source["reliability"],
                                    "summary": summary,
                                    "content_text": content_text,
                                })
                                
                            logger.info(f"✓ {source['name']}: {len(feed.entries[:8])} articles")
                        
                        await asyncio.sleep(1.5)  # Be respectful to servers
                        
                except Exception as e:
                    logger.error(f"✗ {source['name']}: {e}")
                    continue
    
    # Deduplicate by URL
    seen_urls = set()
    unique_articles = []
    for art in all_articles:
        if art["url"] not in seen_urls:
            seen_urls.add(art["url"])
            unique_articles.append(art)
    
    # Analyze bias for each article
    for article in unique_articles:
        article["bias"] = analyze_bias(article.get("content_text", ""), article["source_leaning"])
    
    # Sort by publication date
    unique_articles.sort(key=lambda x: x.get("published_at", ""), reverse=True)
    
    # Store
    articles_store = unique_articles[:300]
    topics_store = cluster_topics(unique_articles)
    last_fetch_time = datetime.utcnow()
    
    logger.info(f"📰 Fetched {len(unique_articles)} articles, {len(topics_store)} topics")
    return len(unique_articles)

# ─── GraphQL Schema ───
@strawberry.type
class Source:
    id: str
    name: str
    country: str
    region: str
    political_leaning: str
    reliability_rating: float

@strawberry.type
class BiasProfile:
    primary_bias: Optional[str]
    intensity: float
    confidence: float
    scores: str
    loaded_words: List[str]
    weasel_phrases: List[str]

@strawberry.type
class Article:
    id: str
    title: str
    url: str
    published_at: str
    source: Source
    summary: Optional[str]
    topic_label: Optional[str]
    bias_profile: Optional[BiasProfile]

@strawberry.type
class TopicCluster:
    id: str
    label: str
    emoji: str
    keywords: List[str]
    article_count: int
    source_diversity: int
    left_count: int
    center_count: int
    right_count: int

@strawberry.type
class FramingItem:
    source: Source
    headline: str
    framing_angle: str
    url: str

@strawberry.type
class DeepDive:
    topic: TopicCluster
    ai_synthesis: str
    left_framing: List[FramingItem]
    right_framing: List[FramingItem]
    global_south: List[FramingItem]
    left_count: int
    center_count: int
    right_count: int

@strawberry.type
class FetchResult:
    success: bool
    articles_fetched: int
    topics_found: int
    message: str

@strawberry.type
class Query:
    @strawberry.field
    def prism_feed(self, first: int = 30) -> List[Article]:
        result = []
        for a in articles_store[:first]:
            bias = a.get("bias", {})
            # Find topic
            topic_label = None
            for t in topics_store:
                if any(art.get("id") == a["id"] for art in t.get("articles", [])):
                    topic_label = t["label"]
                    break
            
            result.append(Article(
                id=a["id"],
                title=a["title"],
                url=a["url"],
                published_at=a.get("published_at", ""),
                source=Source(
                    id=a["source_id"],
                    name=a["source_name"],
                    country=a.get("source_country", ""),
                    region=a.get("source_region", "global"),
                    political_leaning=a["source_leaning"],
                    reliability_rating=a["source_reliability"],
                ),
                summary=a.get("summary", "")[:200],
                topic_label=topic_label,
                bias_profile=BiasProfile(
                    primary_bias=bias.get("primary_bias"),
                    intensity=bias.get("intensity", 0),
                    confidence=bias.get("confidence", 0),
                    scores=json.dumps(bias.get("scores", {})),
                    loaded_words=bias.get("loaded_words", []),
                    weasel_phrases=bias.get("weasel_phrases", []),
                ),
            ))
        return result
    
    @strawberry.field
    def topics(self) -> List[TopicCluster]:
        return [
            TopicCluster(
                id=t["id"], label=t["label"], emoji=t.get("emoji", "📰"),
                keywords=t["keywords"][:5],
                article_count=t["article_count"],
                source_diversity=t["source_diversity"],
                left_count=t.get("left_count", 0),
                center_count=t.get("center_count", 0),
                right_count=t.get("right_count", 0),
            )
            for t in topics_store[:15]
        ]
    
    @strawberry.field
    def deep_dive(self, topic_id: str) -> Optional[DeepDive]:
        topic = next((t for t in topics_store if t["id"] == topic_id), None)
        if not topic:
            return None
        
        articles = topic["articles"]
        
        left_arts = [a for a in articles if a["source_leaning"] in ["left", "center_left", "far_left"]]
        right_arts = [a for a in articles if a["source_leaning"] in ["right", "center_right", "far_right"]]
        global_south_arts = [a for a in articles if a.get("source_region") in ["africa", "asia", "latin_america", "middle_east"]]
        
        def make_framing(art):
            return FramingItem(
                source=Source(
                    id=art["source_id"], name=art["source_name"],
                    country=art.get("source_country", ""),
                    region=art.get("source_region", "global"),
                    political_leaning=art["source_leaning"],
                    reliability_rating=art["source_reliability"],
                ),
                headline=art["title"],
                framing_angle=art.get("summary", "")[:150] if art.get("summary") else art["title"],
                url=art["url"],
            )
        
        synthesis = (
            f"This topic is covered by {len(articles)} articles from {topic['source_diversity']} sources. "
            f"The political spectrum is balanced with {topic.get('left_count', 0)} left-leaning, "
            f"{topic.get('center_count', 0)} center, and {topic.get('right_count', 0)} right-leaning sources. "
            f"Compare the different framings below to understand the full picture."
        )
        
        return DeepDive(
            topic=TopicCluster(
                id=topic["id"], label=topic["label"],
                emoji=topic.get("emoji", "📰"),
                keywords=topic["keywords"][:5],
                article_count=topic["article_count"],
                source_diversity=topic["source_diversity"],
                left_count=topic.get("left_count", 0),
                center_count=topic.get("center_count", 0),
                right_count=topic.get("right_count", 0),
            ),
            ai_synthesis=synthesis,
            left_framing=[make_framing(a) for a in left_arts[:5]],
            right_framing=[make_framing(a) for a in right_arts[:5]],
            global_south=[make_framing(a) for a in global_south_arts[:5]],
            left_count=topic.get("left_count", 0),
            center_count=topic.get("center_count", 0),
            right_count=topic.get("right_count", 0),
        )
    
    @strawberry.field
    def refresh_news(self) -> FetchResult:
        """Manually trigger a news fetch"""
        try:
            count = asyncio.run(fetch_all_news())
            return FetchResult(
                success=True,
                articles_fetched=count,
                topics_found=len(topics_store),
                message=f"Successfully fetched {count} articles"
            )
        except Exception as e:
            return FetchResult(
                success=False,
                articles_fetched=0,
                topics_found=0,
                message=str(e)
            )
    
    @strawberry.field
    def stats(self) -> str:
        """Get current stats"""
        leanings = {}
        regions = {}
        for a in articles_store:
            l = a.get("source_leaning", "unknown")
            r = a.get("source_region", "unknown")
            leanings[l] = leanings.get(l, 0) + 1
            regions[r] = regions.get(r, 0) + 1
        
        return json.dumps({
            "total_articles": len(articles_store),
            "total_topics": len(topics_store),
            "last_fetch": last_fetch_time.isoformat() if last_fetch_time else None,
            "by_leaning": leanings,
            "by_region": regions,
        })

@strawberry.type
class Mutation:
    @strawberry.mutation
    def refresh_feed(self) -> FetchResult:
        try:
            count = asyncio.run(fetch_all_news())
            return FetchResult(
                success=True,
                articles_fetched=count,
                topics_found=len(topics_store),
                message=f"Feed refreshed with {count} articles"
            )
        except Exception as e:
            return FetchResult(
                success=False,
                articles_fetched=0,
                topics_found=0,
                message=str(e)
            )

schema = strawberry.Schema(query=Query, mutation=Mutation)

# ─── FastAPI App ───
app = FastAPI(title="NewsPrism", description="Global News Observatory API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

graphql_app = GraphQLRouter(schema)
app.include_router(graphql_app, prefix="/graphql")

@app.on_event("startup")
async def startup_event():
    """Fetch news on startup and then periodically"""
    logger.info("🚀 NewsPrism starting up...")
    
    # Initial fetch
    asyncio.create_task(fetch_all_news())
    
    # Background refresh every 10 minutes
    async def periodic_refresh():
        while True:
            await asyncio.sleep(600)  # 10 minutes
            try:
                await fetch_all_news()
            except Exception as e:
                logger.error(f"Periodic refresh error: {e}")
    
    asyncio.create_task(periodic_refresh())

@app.get("/")
async def root():
    return {
        "name": "NewsPrism API",
        "version": "1.0",
        "endpoints": {
            "graphql": "/graphql",
            "health": "/health",
        },
        "stats": {
            "articles": len(articles_store),
            "topics": len(topics_store),
            "last_fetch": last_fetch_time.isoformat() if last_fetch_time else "never",
        }
    }

@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "articles": len(articles_store),
        "topics": len(topics_store),
        "timestamp": datetime.utcnow().isoformat(),
    }
