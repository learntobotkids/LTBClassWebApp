const fs = require('fs');
const path = require('path');
const os = require('os');

// Ensure data/analytics directory exists
const DATA_DIR = path.join(__dirname, 'data', 'analytics');
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * Analytics Service
 * Handles logging of telemetry events to local JSONL files.
 * Uses Hostname Partitioning to support distributed offline syncing.
 */
const analyticsService = {

    /**
     * Logs an event to the daily analytics file.
     * @param {Object} eventData - The event data to log.
     */
    logEvent: (eventData) => {
        try {
            const hostname = os.hostname().replace(/[^a-zA-Z0-9.-]/g, '_'); // Sanitize hostname
            const date = new Date();
            const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD

            // Filename: analytics_YYYY-MM-DD_<HOSTNAME>.jsonl
            const filename = `analytics_${dateStr}_${hostname}.jsonl`;
            const filePath = path.join(DATA_DIR, filename);

            // Add server-side metadata
            const entry = {
                ...eventData,
                serverTimestamp: date.toISOString(),
                serverHostname: hostname
            };

            // Append to file (JSONL format: one JSON object per line)
            const line = JSON.stringify(entry) + '\n';

            fs.appendFile(filePath, line, (err) => {
                if (err) console.error('Error writing to analytics file:', err);
            });

        } catch (error) {
            console.error('Error in logEvent:', error);
        }
    },

    /**
     * Reads all JSONL files for a given date and returns a unified array of events.
     * Handles hostname-partitioned files (analytics_YYYY-MM-DD_HOSTNAME.jsonl).
     * @param {string} dateStr - Date string in YYYY-MM-DD format.
     * @returns {Array} - Array of event objects.
     */
    getDailyLogs: (dateStr) => {
        try {
            if (!fs.existsSync(DATA_DIR)) return [];

            // Find all files matching the date pattern
            // Pattern: analytics_2025-12-30_*.jsonl
            const files = fs.readdirSync(DATA_DIR).filter(f =>
                f.startsWith(`analytics_${dateStr}_`) && f.endsWith('.jsonl')
            );

            let allEvents = [];

            files.forEach(file => {
                try {
                    const content = fs.readFileSync(path.join(DATA_DIR, file), 'utf8');
                    // Split by newlines and parse each line
                    content.split('\n').forEach(line => {
                        if (line.trim()) {
                            try {
                                const event = JSON.parse(line);
                                allEvents.push(event);
                            } catch (e) {
                                // Skip malformed lines
                            }
                        }
                    });
                } catch (err) {
                    console.error(`Error reading analytics file ${file}:`, err);
                }
            });

            return allEvents;

        } catch (error) {
            console.error('Error in getDailyLogs:', error);
            return [];
        }
    },

    /**
     * Aggregates stats for a given time range.
     * @param {string} scope - 'today' or 'week' (default: 'today')
     * @returns {Object} - Aggregated stats object.
     */
    getAggregatedStats: (scope = 'today') => {
        const stats = {
            pageViews: {},
            topVideos: {},
            recentActivity: [],
            heatmap: Array(24).fill(0),
            totalEvents: 0
        };

        try {
            const date = new Date();
            const dateStr = date.toISOString().split('T')[0];

            // For now, simple implementation: fetch TODAY's data
            // (Can extend to loop through last 7 days for 'week' scope)
            const events = analyticsService.getDailyLogs(dateStr);
            stats.totalEvents = events.length;

            events.forEach(e => {
                // 1. Page Views
                if (e.eventType === 'page_view') {
                    const url = e.url || '/';
                    stats.pageViews[url] = (stats.pageViews[url] || 0) + 1;
                }

                // 2. Heatmap (Hour of Day)
                if (e.timestamp) {
                    const hour = new Date(e.timestamp).getHours();
                    if (hour >= 0 && hour < 24) {
                        stats.heatmap[hour]++;
                    }
                }

                // 3. Video Engagement
                if (e.eventType === 'video_heartbeat' || e.eventType === 'video_start') {
                    const title = e.videoTitle || 'Unknown Video';
                    if (!stats.topVideos[title]) {
                        stats.topVideos[title] = { views: 0, watchTime: 0 };
                    }
                    if (e.eventType === 'video_start') {
                        stats.topVideos[title].views++;
                    }
                    // Estimate watch time: each heartbeat is ~15s
                    if (e.eventType === 'video_heartbeat') {
                        stats.topVideos[title].watchTime += 15;
                    }
                }

                // 4. Recent Activity (Raw Feed)
                // Limit to last 50 events for the feed
            });

            // Sort and slice recent activity
            // Use reverse chronological order
            stats.recentActivity = events
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                .slice(0, 50);

            return stats;

        } catch (error) {
            console.error('Error in getAggregatedStats:', error);
            return stats;
        }
    }
};

module.exports = analyticsService;

