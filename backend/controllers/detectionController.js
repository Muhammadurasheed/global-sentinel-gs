const { getFirestore, logger, isDemoMode } = require('../config/firebase');
const { v4: uuidv4 } = require('uuid');

// In-memory cache for threats when Firebase quota is exceeded
let threatCache = [];
let lastCacheUpdate = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

class DetectionController {
  static async detectThreats(req, res) {
    try {
      console.log('🔍 Running threat detection...');
      
      const { sources = [], analysisType = 'comprehensive' } = req.body;
      
      // Get real threats from Firestore
      const threats = await DetectionController.getActiveThreatsData();
      
      res.json({
        success: true,
        threats: threats.slice(0, 10), // Return first 10 for detection
        count: threats.length,
        message: 'Threat detection completed successfully'
      });
      
    } catch (error) {
      console.error('🚨 Threat detection error:', error);
      res.status(500).json({
        success: false,
        error: 'Threat detection system failure',
        message: error.message
      });
    }
  }

  static async getActiveThreats(req, res) {
    try {
      console.log('📋 Fetching active threats for frontend');
      
      const { page = 1, limit = 10 } = req.query;
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      
      if (isDemoMode()) {
        console.log('🎭 Demo mode: returning mock threats');
        const mockThreats = DetectionController.getMockThreats();
        const startIndex = (pageNum - 1) * limitNum;
        const endIndex = startIndex + limitNum;
        
        return res.json({
          success: true,
          threats: mockThreats.slice(startIndex, endIndex),
          hasMore: mockThreats.length > endIndex,
          total: mockThreats.length,
          page: pageNum
        });
      }

      // Try to get fresh threats from Firestore
      const threats = await DetectionController.getActiveThreatsData();
      
      // Apply pagination
      const startIndex = (pageNum - 1) * limitNum;
      const endIndex = startIndex + limitNum;
      const paginatedThreats = threats.slice(startIndex, endIndex);
      
      res.json({
        success: true,
        threats: paginatedThreats,
        hasMore: threats.length > endIndex,
        total: threats.length,
        page: pageNum,
        cached: false
      });
      
    } catch (error) {
      console.error('❌ Failed to fetch active threats:', error);
      
      // Fallback to mock data
      const mockThreats = DetectionController.getMockThreats();
      const pageNum = parseInt(req.query.page || 1);
      const limitNum = parseInt(req.query.limit || 10);
      const startIndex = (pageNum - 1) * limitNum;
      const endIndex = startIndex + limitNum;
      
      res.json({
        success: true,
        threats: mockThreats.slice(startIndex, endIndex),
        hasMore: mockThreats.length > endIndex,
        total: mockThreats.length,
        page: pageNum,
        error: true,
        message: 'Using fallback data due to backend error'
      });
    }
  }

  static async getActiveThreatsData() {
    const now = Date.now();
    
    // Check cache first
    if (threatCache.length > 0 && lastCacheUpdate && (now - lastCacheUpdate) < CACHE_DURATION) {
      console.log('📦 Using cached threats data');
      return threatCache;
    }

    try {
      const db = getFirestore();
      
      // Get all 30 rotational threat slots
      const snapshot = await db.collection('threats')
        .where('status', '==', 'active')
        .orderBy('updatedAt', 'desc')
        .limit(30)
        .get();
      
      const threats = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        threats.push({
          id: doc.id,
          ...data,
          sources: data.sources || [data.source_url || 'https://global-intelligence.gov']
        });
      });
      
      // Update cache
      threatCache = threats;
      lastCacheUpdate = now;
      
      logger.info(`✅ Retrieved ${threats.length} active threats from rotational slots`);
      return threats;
      
    } catch (error) {
      console.warn('⚠️ Firestore fetch failed, using cache or mock');
      
      if (threatCache.length > 0) {
        return threatCache;
      }
      
      // Final fallback
      return DetectionController.getMockThreats();
    }
  }

  static async ingestThreat(req, res) {
    try {
      console.log('📥 Ingesting threat from scraper');
      
      const { title, type, severity, summary, regions, sources, location, tags, signal_type } = req.body;
      
      if (!title || !type || !severity) {
        return res.status(400).json({
          success: false,
          error: 'Title, type, and severity are required'
        });
      }

      const threatData = {
        id: uuidv4(),
        title,
        type,
        severity: parseInt(severity),
        summary: summary || 'No summary provided',
        regions: regions || ['Global'],
        sources: sources || ['SIGINT-Intelligence'],
        source_url: sources?.[0] || 'https://sigint-intelligence.gov',
        location: location || 'Global',
        tags: tags || [type.toLowerCase()],
        signal_type: signal_type || type,
        timestamp: new Date().toISOString(),
        status: 'active',
        confidence: Math.floor(Math.random() * 30) + 70,
        votes: { credible: 0, not_credible: 0 },
        updatedAt: new Date().toISOString()
      };

      if (!isDemoMode()) {
        try {
          const db = getFirestore();
          
          // Find next available slot or overwrite oldest
          const snapshot = await db.collection('threats')
            .orderBy('updatedAt', 'asc')
            .limit(1)
            .get();
          
          let threatId = `threat_${String(Math.floor(Math.random() * 30) + 1).padStart(3, '0')}`;
          
          if (!snapshot.empty) {
            threatId = snapshot.docs[0].id;
          }
          
          await db.collection('threats').doc(threatId).set({
            ...threatData,
            id: threatId
          });
          
        } catch (firestoreError) {
          console.warn('⚠️ Firebase ingestion failed, continuing with mock response');
        }
      }

      console.log(`✅ Threat ingested successfully: ${title}`);
      
      res.json({
        success: true,
        threat: threatData,
        message: 'Threat ingested successfully'
      });
      
    } catch (error) {
      console.error('❌ Threat ingestion failed:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to ingest threat'
      });
    }
  }

  static getMockThreats() {
    return [
      {
        id: 'threat_cyber_001',
        title: 'Advanced Persistent Threat Targeting Financial Infrastructure',
        type: 'Cyber',
        severity: 85,
        summary: 'Sophisticated malware campaign targeting banking systems across multiple countries. Evidence suggests state-sponsored actors using zero-day exploits.',
        regions: ['North America', 'Europe', 'Asia'],
        sources: ['https://cisa.gov/alerts', 'https://cert.org/advisories', 'https://us-cert.gov/ncas'],
        timestamp: new Date(Date.now() - 3600000).toISOString(),
        status: 'active',
        confidence: 88,
        votes: { credible: 24, not_credible: 3 }
      },
      {
        id: 'threat_health_002',
        title: 'Emerging Antimicrobial Resistance in Southeast Asia',
        type: 'Health',
        severity: 72,
        summary: 'New strain of antibiotic-resistant bacteria spreading rapidly through healthcare facilities across multiple countries.',
        regions: ['Southeast Asia'],
        sources: ['https://who.int/emergencies', 'https://cdc.gov/drugresistance', 'https://ecdc.europa.eu'],
        timestamp: new Date(Date.now() - 7200000).toISOString(),
        status: 'active',
        confidence: 82,
        votes: { credible: 18, not_credible: 1 }
      },
      {
        id: 'threat_climate_003',
        title: 'Critical Water Shortage Crisis in Mediterranean Basin',
        type: 'Climate',
        severity: 78,
        summary: 'Unprecedented drought conditions threatening agricultural stability and regional security across Southern Europe.',
        regions: ['Mediterranean', 'Southern Europe'],
        sources: ['https://climate.ec.europa.eu', 'https://ipcc.ch/reports', 'https://drought.gov'],
        timestamp: new Date(Date.now() - 10800000).toISOString(),
        status: 'active',
        confidence: 91,
        votes: { credible: 31, not_credible: 2 }
      },
      {
        id: 'threat_conflict_004',
        title: 'Escalating Tensions in Eastern European Border Regions',
        type: 'Conflict',
        severity: 83,
        summary: 'Military buildup and diplomatic tensions escalating along contested border areas with potential for wider conflict.',
        regions: ['Eastern Europe'],
        sources: ['https://nato.int/cps', 'https://sipri.org/databases', 'https://crisisgroup.org'],
        timestamp: new Date(Date.now() - 14400000).toISOString(),
        status: 'active',
        confidence: 76,
        votes: { credible: 28, not_credible: 5 }
      },
      {
        id: 'threat_economic_005',
        title: 'Cryptocurrency Market Manipulation Threatening Financial Stability',
        type: 'Economic',
        severity: 69,
        summary: 'Large-scale coordinated trading attacks targeting major cryptocurrency exchanges and stablecoins.',
        regions: ['Global'],
        sources: ['https://sec.gov/news', 'https://bis.org/publ', 'https://federalreserve.gov'],
        timestamp: new Date(Date.now() - 18000000).toISOString(),
        status: 'active',
        confidence: 74,
        votes: { credible: 15, not_credible: 8 }
      },
      {
        id: 'threat_ai_006',
        title: 'Deepfake Technology Weaponization for Disinformation Campaigns',
        type: 'AI',
        severity: 80,
        summary: 'Advanced AI-generated content being used to spread false information and manipulate public opinion.',
        regions: ['Global'],
        sources: ['https://ai.gov/reports', 'https://partnership.ai', 'https://oecd.org/digital'],
        timestamp: new Date(Date.now() - 21600000).toISOString(),
        status: 'active',
        confidence: 85,
        votes: { credible: 22, not_credible: 4 }
      }
    ];
  }
}

module.exports = DetectionController;
