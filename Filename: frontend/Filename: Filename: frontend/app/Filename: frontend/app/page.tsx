'use client'

import { ApolloClient, InMemoryCache, ApolloProvider, useQuery, useMutation, gql } from '@apollo/client'
import { useState } from 'react'

// API URL - will be replaced by Render
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://newsprism-api.onrender.com'
const GRAPHQL_URL = `https://${API_URL}/graphql`

const client = new ApolloClient({
  uri: GRAPHQL_URL,
  cache: new InMemoryCache(),
})

// GraphQL queries
const PRISM_FEED = gql`
  query PrismFeed($first: Int!) {
    prismFeed(first: $first) {
      id title url publishedAt
      source {
        id name country region politicalLeaning reliabilityRating
      }
      summary topicLabel
      biasProfile {
        primaryBias intensity loadedWords weaselPhrases
      }
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
  query Topics {
    topics { id label emoji articleCount sourceDiversity leftCount centerCount rightCount }
  }
`

const REFRESH_MUTATION = gql`
  mutation RefreshFeed {
    refreshFeed { success articlesFetched message }
  }
`

// Styles
const styles = {
  container: { maxWidth: '680px', margin: '0 auto', padding: '16px' },
  header: { padding: '20px 0', borderBottom: '1px solid #e5e5e5', marginBottom: '20px' },
  title: { fontSize: '28px', fontWeight: 300, margin: 0, color: '#1a1a2e' },
  subtitle: { fontSize: '13px', color: '#888', marginTop: '4px' },
  articleCard: {
    background: '#fff', borderRadius: '12px', padding: '16px', marginBottom: '12px',
    border: '1px solid #eee', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  },
  sourceRow: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' as const },
  leaningBadge: (leaning: string) => ({
    fontSize: '11px', padding: '2px 8px', borderRadius: '12px', fontWeight: 600,
    background:
      leaning.includes('left') ? '#e3f2fd' :
      leaning.includes('right') ? '#fff3e0' :
      '#e8f5e9',
    color:
      leaning.includes('left') ? '#1565c0' :
      leaning.includes('right') ? '#e65100' :
      '#2e7d32',
  }),
  headline: {
    fontSize: '16px', fontWeight: 600, color: '#1a1a2e', marginBottom: '6px',
    lineHeight: 1.4, textDecoration: 'none', display: 'block',
  },
  summary: { fontSize: '13px', color: '#666', lineHeight: 1.5, marginBottom: '10px',
    display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' as const,
  },
  biasBar: { height: '3px', background: '#eee', borderRadius: '2px', marginTop: '8px', overflow: 'hidden' },
  biasFill: (color: string, width: number) => ({
    height: '100%', width: `${width}%`, background: color, borderRadius: '2px', transition: 'width 0.3s',
  }),
  loadedWord: { fontSize: '10px', padding: '1px 6px', background: '#fff3cd', color: '#856404', borderRadius: '8px' },
  topicChip: { fontSize: '11px', padding: '3px 10px', background: '#f3e5f5', color: '#6a1b9a', borderRadius: '12px', border: 'none', cursor: 'pointer' },
  refreshButton: {
    padding: '12px 24px', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: '8px',
    fontSize: '14px', cursor: 'pointer', width: '100%', marginBottom: '20px',
  },
  overlay: {
    position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
  },
  deepDivePanel: {
    background: '#fff', borderRadius: '16px', maxWidth: '800px', width: '100%',
    maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
  },
  synthesis: {
    background: 'linear-gradient(135deg, #e3f2fd, #f3e5f5, #fff3e0)', padding: '16px',
    borderRadius: '12px', margin: '16px', fontSize: '13px', lineHeight: 1.6,
  },
  framingColumn: {
    padding: '12px', margin: '8px 16px', background: '#fafafa', borderRadius: '8px',
    borderLeft: '3px solid #ccc',
  },
}

function LeaningBadge({ leaning }: { leaning: string }) {
  return <span style={styles.leaningBadge(leaning)}>{leaning.replace(/_/g, ' ')}</span>
}

function BiasBar({ bias }: { bias: any }) {
  if (!bias) return null
  const color = bias.primaryBias?.includes('left') ? '#1565c0' :
                bias.primaryBias?.includes('right') ? '#e65100' : '#2e7d32'
  const width = Math.round((bias.intensity || 0) * 100)
  
  return (
    <div style={{ marginTop: '8px' }}>
      <div style={styles.biasBar}>
        <div style={styles.biasFill(color, width)} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
        <span style={{ fontSize: '10px', color: '#999' }}>
          {bias.primaryBias ? bias.primaryBias.replace(/_/g, ' ') : 'neutral'} · {width}%
        </span>
        {bias.loadedWords?.length > 0 && (
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            {bias.loadedWords.slice(0, 3).map((w: string) => (
              <span key={w} style={styles.loadedWord}>{w}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function DeepDivePanel({ topicId, onClose }: { topicId: string; onClose: () => void }) {
  const { data, loading } = useQuery(DEEP_DIVE, { variables: { topicId } })
  
  if (loading) return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={{ ...styles.deepDivePanel, padding: '32px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
        <p style={{ color: '#888' }}>Loading deep dive...</p>
      </div>
    </div>
  )
  
  if (!data?.deepDive) return null
  
  const dive = data.deepDive
  const total = dive.leftCount + dive.centerCount + dive.rightCount || 1
  
  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.deepDivePanel} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding: '20px', borderBottom: '1px solid #eee', position: 'sticky', top: 0, background: '#fff', borderRadius: '16px 16px 0 0', zIndex: 1 }}>
          <button onClick={onClose} style={{ float: 'right', background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#999' }}>×</button>
          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 300 }}>{dive.topic.emoji} {dive.topic.label}</h2>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#888' }}>
            {dive.topic.articleCount} articles · {dive.topic.sourceDiversity} sources
          </p>
        </div>
        
        {/* Spectrum Bar */}
        <div style={{ padding: '16px' }}>
          <div style={{ display: 'flex', height: '8px', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ width: `${(dive.leftCount/total)*100}%`, background: '#1565c0', transition: 'width 0.5s' }} />
            <div style={{ width: `${(dive.centerCount/total)*100}%`, background: '#2e7d32', transition: 'width 0.5s' }} />
            <div style={{ width: `${(dive.rightCount/total)*100}%`, background: '#e65100', transition: 'width 0.5s' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#999', marginTop: '4px' }}>
            <span>Left ({dive.leftCount})</span>
            <span>Center ({dive.centerCount})</span>
            <span>Right ({dive.rightCount})</span>
          </div>
        </div>
        
        {/* AI Synthesis */}
        <div style={styles.synthesis}>
          <p style={{ margin: 0, fontSize: '11px', color: '#6a1b9a', marginBottom: '6px', fontWeight: 600 }}>⚡ AI SYNTHESIS</p>
          <p style={{ margin: 0, color: '#333', fontSize: '13px' }}>{dive.aiSynthesis}</p>
        </div>
        
        {/* Left vs Right */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', padding: '0 16px 16px' }}>
          <div>
            <h4 style={{ fontSize: '13px', color: '#1565c0', marginBottom: '8px' }}>◀ Left Perspectives</h4>
            {dive.leftFraming.map((f: any, i: number) => (
              <div key={i} style={styles.framingColumn}>
                <p style={{ fontSize: '11px', color: '#888', margin: '0 0 4px' }}>{f.source.name} · {f.source.politicalLeaning}</p>
                <a href={f.url} target="_blank" style={{ fontSize: '13px', color: '#1a1a2e', textDecoration: 'none', fontWeight: 500 }}>{f.headline}</a>
                <p style={{ fontSize: '11px', color: '#999', marginTop: '4px', fontStyle: 'italic' }}>"{f.framingAngle.slice(0, 100)}"</p>
              </div>
            ))}
          </div>
          <div>
            <h4 style={{ fontSize: '13px', color: '#e65100', marginBottom: '8px' }}>Right Perspectives ▶</h4>
            {dive.rightFraming.map((f: any, i: number) => (
              <div key={i} style={styles.framingColumn}>
                <p style={{ fontSize: '11px', color: '#888', margin: '0 0 4px' }}>{f.source.name} · {f.source.politicalLeaning}</p>
                <a href={f.url} target="_blank" style={{ fontSize: '13px', color: '#1a1a2e', textDecoration: 'none', fontWeight: 500 }}>{f.headline}</a>
                <p style={{ fontSize: '11px', color: '#999', marginTop: '4px', fontStyle: 'italic' }}>"{f.framingAngle.slice(0, 100)}"</p>
              </div>
            ))}
          </div>
        </div>
        
        {/* Global South */}
        {dive.globalSouth.length > 0 && (
          <div style={{ padding: '0 16px 16px' }}>
            <h4 style={{ fontSize: '13px', color: '#e67e22', marginBottom: '8px' }}>🌍 Global South Voices</h4>
            {dive.globalSouth.map((f: any, i: number) => (
              <div key={i} style={{ ...styles.framingColumn, borderLeftColor: '#e67e22' }}>
                <p style={{ fontSize: '11px', color: '#888', margin: '0 0 4px' }}>{f.source.name} · {f.source.country}</p>
                <a href={f.url} target="_blank" style={{ fontSize: '13px', color: '#1a1a2e', textDecoration: 'none', fontWeight: 500 }}>{f.headline}</a>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function NewsFeed() {
  const { data, loading, error } = useQuery(PRISM_FEED, { variables: { first: 50 }, pollInterval: 300000 })
  const { data: topicsData } = useQuery(TOPICS_QUERY)
  const [refreshFeed] = useMutation(REFRESH_MUTATION)
  const [deepDiveTopic, setDeepDiveTopic] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  
  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await refreshFeed()
    } catch(e) {}
    setRefreshing(false)
  }
  
  const articles = data?.prismFeed || []
  const topics = topicsData?.topics || []
  
  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={styles.title}>🔮 NewsPrism</h1>
            <p style={styles.subtitle}>
              {articles.length} articles · {topics.length} topics · See all sides
            </p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            style={{
              ...styles.refreshButton,
              width: 'auto',
              padding: '8px 16px',
              background: refreshing ? '#ccc' : '#1a1a2e',
              fontSize: '12px',
            }}
          >
            {refreshing ? '⏳' : '🔄'} Refresh
          </button>
        </div>
      </div>
      
      {/* Loading State */}
      {loading && articles.length === 0 && (
        <div style={{ padding: '32px', textAlign: 'center' }}>
          <div style={{ fontSize: '40px', marginBottom: '16px' }}>🔮</div>
          <p style={{ color: '#888' }}>Fetching global news...</p>
          <p style={{ fontSize: '12px', color: '#aaa' }}>First load may take 30 seconds</p>
          <div style={{ marginTop: '16px', height: '4px', background: '#eee', borderRadius: '2px', overflow: 'hidden', maxWidth: '200px', margin: '16px auto' }}>
            <div style={{ height: '100%', width: '60%', background: 'linear-gradient(90deg, #1565c0, #2e7d32, #e65100)', borderRadius: '2px', animation: 'pulse 2s infinite' }} />
          </div>
        </div>
      )}
      
      {/* Error State */}
      {error && (
        <div style={{ padding: '24px', textAlign: 'center', background: '#fff', borderRadius: '12px', marginBottom: '16px' }}>
          <p style={{ color: '#c62828', margin: '0 0 8px' }}>⚠️ Unable to load news</p>
          <p style={{ fontSize: '12px', color: '#888', margin: '0 0 16px' }}>
            The backend might be starting up. Free services take 30-60 seconds on first load.
          </p>
          <button onClick={handleRefresh} style={styles.refreshButton}>Try Again</button>
        </div>
      )}
      
      {/* Topic Quick Links */}
      {topics.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
          {topics.slice(0, 8).map((topic: any) => (
            <button
              key={topic.id}
              onClick={() => setDeepDiveTopic(topic.id)}
              style={styles.topicChip}
            >
              {topic.emoji} {topic.label} ({topic.articleCount})
            </button>
          ))}
        </div>
      )}
      
      {/* Article Feed */}
      {articles.map((article: any) => (
        <article key={article.id} style={styles.articleCard}>
          {/* Source Row */}
          <div style={styles.sourceRow}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#555' }}>
              {article.source.name}
            </span>
            <span style={{ fontSize: '12px', color: '#aaa' }}>{article.source.country}</span>
            <LeaningBadge leaning={article.source.politicalLeaning} />
            <span style={{ fontSize: '10px', color: '#f39c12' }}>
              {'★'.repeat(Math.round(article.source.reliabilityRating))}
            </span>
          </div>
          
          {/* Headline */}
          <a href={article.url} target="_blank" rel="noopener" style={styles.headline}>
            {article.title}
          </a>
          
          {/* Summary */}
          {article.summary && <p style={styles.summary}>{article.summary}</p>}
          
          {/* Topic link */}
          {article.topicLabel && (
            <button
              onClick={() => setDeepDiveTopic(
                topics.find((t: any) => t.label === article.topicLabel)?.id
              )}
              style={{ ...styles.topicChip, marginBottom: '8px' }}
            >
              {article.topicLabel}
            </button>
          )}
          
          {/* Bias bar */}
          <BiasBar bias={article.biasProfile} />
        </article>
      ))}
      
      {/* Empty State */}
      {!loading && articles.length === 0 && !error && (
        <div style={{ padding: '32px', textAlign: 'center', background: '#fff', borderRadius: '12px' }}>
          <p style={{ fontSize: '40px', margin: '0 0 16px' }}>📭</p>
          <p style={{ color: '#888', margin: '0 0 16px' }}>No articles yet. Click refresh to fetch the latest news.</p>
          <button onClick={handleRefresh} style={styles.refreshButton}>
            Fetch News
          </button>
        </div>
      )}
      
      {/* Deep Dive Modal */}
      {deepDiveTopic && (
        <DeepDivePanel topicId={deepDiveTopic} onClose={() => setDeepDiveTopic(null)} />
      )}
      
      {/* Footer */}
      <div style={{ textAlign: 'center', padding: '32px 0', color: '#ccc', fontSize: '11px' }}>
        NewsPrism · See the world through a prism, not a lens
      </div>
    </div>
  )
}

export default function Home() {
  return (
    <ApolloProvider client={client}>
      <NewsFeed />
    </ApolloProvider>
  )
}
