'use client'

import { ApolloClient, InMemoryCache, ApolloProvider, useQuery, useMutation, gql } from '@apollo/client'
import { useState } from 'react'

const API_URL = typeof window !== 'undefined' 
  ? (process.env.NEXT_PUBLIC_API_URL || 'newsprism-api.onrender.com')
  : 'newsprism-api.onrender.com'
const GRAPHQL_URL = `https://${API_URL}/graphql`

const client = new ApolloClient({
  uri: GRAPHQL_URL,
  cache: new InMemoryCache(),
})

const PRISM_FEED = gql`
  query PrismFeed($first: Int!) {
    prismFeed(first: $first) {
      id title url publishedAt
      source { id name country region politicalLeaning reliabilityRating }
      summary topicLabel
      biasProfile { primaryBias intensity loadedWords weaselPhrases }
    }
  }
`

const DEEP_DIVE = gql`
  query DeepDive($topicId: String!) {
    deepDive(topicId: $topicId) {
      topic { id label emoji keywords articleCount sourceDiversity leftCount centerCount rightCount }
      aiSynthesis
      leftFraming { source { name politicalLeaning } headline framingAngle url }
      rightFraming { source { name politicalLeaning } headline framingAngle url }
      globalSouth { source { name country } headline url }
      leftCount centerCount rightCount
    }
  }
`

const TOPICS_QUERY = gql`
  query Topics { topics { id label emoji articleCount sourceDiversity leftCount centerCount rightCount } }
`

const REFRESH_MUTATION = gql`
  mutation RefreshFeed { refreshFeed { success articlesFetched message } }
`

function LeaningBadge({ leaning }) {
  const bg = leaning?.includes('left') ? '#e3f2fd' : leaning?.includes('right') ? '#fff3e0' : '#e8f5e9'
  const color = leaning?.includes('left') ? '#1565c0' : leaning?.includes('right') ? '#e65100' : '#2e7d32'
  return <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '12px', fontWeight: 600, background: bg, color }}>{leaning?.replace(/_/g, ' ')}</span>
}

function BiasBar({ bias }) {
  if (!bias) return null
  const color = bias.primaryBias?.includes('left') ? '#1565c0' : bias.primaryBias?.includes('right') ? '#e65100' : '#2e7d32'
  const width = Math.round((bias.intensity || 0) * 100)
  return (
    <div style={{ marginTop: '8px' }}>
      <div style={{ height: '3px', background: '#eee', borderRadius: '2px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${width}%`, background: color, borderRadius: '2px' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
        <span style={{ fontSize: '10px', color: '#999' }}>{bias.primaryBias?.replace(/_/g, ' ') || 'neutral'} · {width}%</span>
        {bias.loadedWords?.length > 0 && (
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            {bias.loadedWords.slice(0, 3).map(w => <span key={w} style={{ fontSize: '10px', padding: '1px 6px', background: '#fff3cd', color: '#856404', borderRadius: '8px' }}>{w}</span>)}
          </div>
        )}
      </div>
    </div>
  )
}

function DeepDivePanel({ topicId, onClose }) {
  const { data, loading } = useQuery(DEEP_DIVE, { variables: { topicId } })
  if (loading) return <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ background: '#fff', borderRadius: '16px', padding: '32px' }}><p>Loading deep dive...</p></div></div>
  if (!data?.deepDive) return null
  
  const dive = data.deepDive
  const total = dive.leftCount + dive.centerCount + dive.rightCount || 1
  
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: '16px', maxWidth: '800px', width: '100%', maxHeight: '90vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '20px', borderBottom: '1px solid #eee', position: 'sticky', top: 0, background: '#fff', borderRadius: '16px 16px 0 0' }}>
          <button onClick={onClose} style={{ float: 'right', background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#999' }}>×</button>
          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 300 }}>{dive.topic.emoji} {dive.topic.label}</h2>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#888' }}>{dive.topic.articleCount} articles · {dive.topic.sourceDiversity} sources</p>
        </div>
        <div style={{ padding: '16px' }}>
          <div style={{ display: 'flex', height: '8px', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ width: `${(dive.leftCount/total)*100}%`, background: '#1565c0' }} />
            <div style={{ width: `${(dive.centerCount/total)*100}%`, background: '#2e7d32' }} />
            <div style={{ width: `${(dive.rightCount/total)*100}%`, background: '#e65100' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#999', marginTop: '4px' }}>
            <span>Left ({dive.leftCount})</span><span>Center ({dive.centerCount})</span><span>Right ({dive.rightCount})</span>
          </div>
        </div>
        <div style={{ background: 'linear-gradient(135deg, #e3f2fd, #f3e5f5, #fff3e0)', padding: '16px', borderRadius: '12px', margin: '16px' }}>
          <p style={{ margin: 0, fontSize: '11px', color: '#6a1b9a', marginBottom: '6px', fontWeight: 600 }}>⚡ AI SYNTHESIS</p>
          <p style={{ margin: 0, color: '#333', fontSize: '13px' }}>{dive.aiSynthesis}</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', padding: '0 16px 16px' }}>
          <div><h4 style={{ fontSize: '13px', color: '#1565c0', marginBottom: '8px' }}>◀ Left</h4>
            {dive.leftFraming.map((f, i) => <div key={i} style={{ padding: '12px', margin: '8px 0', background: '#fafafa', borderRadius: '8px', borderLeft: '3px solid #1565c0' }}><p style={{ fontSize: '11px', color: '#888', margin: '0 0 4px' }}>{f.source.name}</p><a href={f.url} target="_blank" style={{ fontSize: '13px', color: '#1a1a2e', textDecoration: 'none', fontWeight: 500 }}>{f.headline}</a></div>)}
          </div>
          <div><h4 style={{ fontSize: '13px', color: '#e65100', marginBottom: '8px' }}>Right ▶</h4>
            {dive.rightFraming.map((f, i) => <div key={i} style={{ padding: '12px', margin: '8px 0', background: '#fafafa', borderRadius: '8px', borderLeft: '3px solid #e65100' }}><p style={{ fontSize: '11px', color: '#888', margin: '0 0 4px' }}>{f.source.name}</p><a href={f.url} target="_blank" style={{ fontSize: '13px', color: '#1a1a2e', textDecoration: 'none', fontWeight: 500 }}>{f.headline}</a></div>)}
          </div>
        </div>
        {dive.globalSouth?.length > 0 && (
          <div style={{ padding: '0 16px 16px' }}><h4 style={{ fontSize: '13px', color: '#e67e22', marginBottom: '8px' }}>🌍 Global South</h4>
            {dive.globalSouth.map((f, i) => <div key={i} style={{ padding: '12px', margin: '8px 0', background: '#fafafa', borderRadius: '8px', borderLeft: '3px solid #e67e22' }}><p style={{ fontSize: '11px', color: '#888', margin: '0 0 4px' }}>{f.source.name} · {f.source.country}</p><a href={f.url} target="_blank" style={{ fontSize: '13px', color: '#1a1a2e', textDecoration: 'none', fontWeight: 500 }}>{f.headline}</a></div>)}
          </div>
        )}
      </div>
    </div>
  )
}

function NewsFeed() {
  const { data, loading, error } = useQuery(PRISM_FEED, { variables: { first: 50 }, pollInterval: 300000 })
  const { data: topicsData } = useQuery(TOPICS_QUERY)
  const [refreshFeed, { loading: refreshing }] = useMutation(REFRESH_MUTATION)
  const [deepDiveTopic, setDeepDiveTopic] = useState(null)
  
  const articles = data?.prismFeed || []
  const topics = topicsData?.topics || []
  
  const handleRefresh = async () => {
    try { await refreshFeed() } catch(e) {}
  }
  
  return (
    <div style={{ maxWidth: '680px', margin: '0 auto', padding: '16px' }}>
      <div style={{ padding: '20px 0', borderBottom: '1px solid #e5e5e5', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 300, margin: 0, color: '#1a1a2e' }}>🔮 NewsPrism</h1>
          <p style={{ fontSize: '13px', color: '#888', marginTop: '4px' }}>{articles.length} articles · {topics.length} topics</p>
        </div>
        <button onClick={handleRefresh} disabled={refreshing} style={{ padding: '8px 16px', background: refreshing ? '#ccc' : '#1a1a2e', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '12px', cursor: 'pointer' }}>{refreshing ? '⏳' : '🔄'} Refresh</button>
      </div>
      
      {loading && articles.length === 0 && (
        <div style={{ padding: '32px', textAlign: 'center' }}><div style={{ fontSize: '40px', marginBottom: '16px' }}>🔮</div><p style={{ color: '#888' }}>Fetching global news...</p></div>
      )}
      
      {error && (
        <div style={{ padding: '24px', textAlign: 'center', background: '#fff', borderRadius: '12px', marginBottom: '16px' }}>
          <p style={{ color: '#c62828' }}>⚠️ Unable to load news</p>
          <button onClick={handleRefresh} style={{ padding: '12px 24px', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: '8px', marginTop: '12px' }}>Try Again</button>
        </div>
      )}
      
      {topics.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
          {topics.slice(0, 8).map(topic => (
            <button key={topic.id} onClick={() => setDeepDiveTopic(topic.id)} style={{ fontSize: '11px', padding: '3px 10px', background: '#f3e5f5', color: '#6a1b9a', borderRadius: '12px', border: 'none', cursor: 'pointer' }}>{topic.emoji} {topic.label} ({topic.articleCount})</button>
          ))}
        </div>
      )}
      
      {articles.map(article => (
        <article key={article.id} style={{ background: '#fff', borderRadius: '12px', padding: '16px', marginBottom: '12px', border: '1px solid #eee' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#555' }}>{article.source.name}</span>
            <span style={{ fontSize: '12px', color: '#aaa' }}>{article.source.country}</span>
            <LeaningBadge leaning={article.source.politicalLeaning} />
          </div>
          <a href={article.url} target="_blank" rel="noopener" style={{ fontSize: '16px', fontWeight: 600, color: '#1a1a2e', textDecoration: 'none', display: 'block', marginBottom: '6px', lineHeight: 1.4 }}>{article.title}</a>
          {article.summary && <p style={{ fontSize: '13px', color: '#666', lineHeight: 1.5, marginBottom: '10px', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{article.summary}</p>}
          {article.topicLabel && <button onClick={() => { const t = topics.find(x => x.label === article.topicLabel); if(t) setDeepDiveTopic(t.id) }} style={{ fontSize: '11px', padding: '3px 10px', background: '#f3e5f5', color: '#6a1b9a', borderRadius: '12px', border: 'none', cursor: 'pointer', marginBottom: '8px' }}>{article.topicLabel}</button>}
          <BiasBar bias={article.biasProfile} />
        </article>
      ))}
      
      {!loading && articles.length === 0 && !error && (
        <div style={{ padding: '32px', textAlign: 'center', background: '#fff', borderRadius: '12px' }}><p style={{ fontSize: '40px', margin: '0 0 16px' }}>📭</p><p style={{ color: '#888' }}>No articles yet. Click refresh to fetch news.</p></div>
      )}
      
      {deepDiveTopic && <DeepDivePanel topicId={deepDiveTopic} onClose={() => setDeepDiveTopic(null)} />}
      
      <div style={{ textAlign: 'center', padding: '32px 0', color: '#ccc', fontSize: '11px' }}>NewsPrism · See the world through a prism, not a lens</div>
    </div>
  )
}

export default function Home() {
  return <ApolloProvider client={client}><NewsFeed /></ApolloProvider>
}
