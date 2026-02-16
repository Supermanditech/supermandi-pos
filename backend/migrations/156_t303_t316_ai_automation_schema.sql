-- T-303→T-316: AI Automation schema
-- Alerts, demand forecasts, auto-closing config, customer insights,
-- anomaly events, product recommendations, expiry tracking

CREATE SCHEMA IF NOT EXISTS ai;

-- T-307: Proactive AI alerts
CREATE TABLE ai.alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID NOT NULL REFERENCES platform.stores(id),
  alert_type VARCHAR(50) NOT NULL,
  severity VARCHAR(20) NOT NULL DEFAULT 'info',
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  is_read BOOLEAN DEFAULT false,
  is_dismissed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- T-308: Demand forecasts (per product per store per day)
CREATE TABLE ai.demand_forecasts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID NOT NULL REFERENCES platform.stores(id),
  product_id UUID NOT NULL,
  forecast_date DATE NOT NULL,
  predicted_qty INT NOT NULL,
  confidence NUMERIC(3,2) DEFAULT 0.50,
  method VARCHAR(30) DEFAULT 'weighted_avg',
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id, product_id, forecast_date)
);

-- T-310: Auto daily closing config (per store)
CREATE TABLE ai.auto_closing_config (
  store_id UUID PRIMARY KEY REFERENCES platform.stores(id),
  enabled BOOLEAN DEFAULT false,
  close_time TIME DEFAULT '23:00',
  last_auto_close_date DATE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- T-312: Customer insights cache (RFM analysis)
CREATE TABLE ai.customer_insights (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID NOT NULL REFERENCES platform.stores(id),
  customer_phone VARCHAR(20) NOT NULL,
  rfm_recency INT,
  rfm_frequency INT,
  rfm_monetary INT,
  rfm_segment VARCHAR(30),
  top_products JSONB DEFAULT '[]',
  avg_basket_size INT,
  avg_basket_value INT,
  last_visit DATE,
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id, customer_phone)
);

-- T-316: Anomaly events
CREATE TABLE ai.anomaly_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID NOT NULL REFERENCES platform.stores(id),
  anomaly_type VARCHAR(50) NOT NULL,
  severity VARCHAR(20) DEFAULT 'warning',
  description TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  is_reviewed BOOLEAN DEFAULT false,
  detected_at TIMESTAMPTZ DEFAULT NOW()
);

-- T-303: Product recommendations
CREATE TABLE ai.product_recommendations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID NOT NULL REFERENCES platform.stores(id),
  product_id UUID NOT NULL,
  recommended_product_id UUID NOT NULL,
  recommendation_type VARCHAR(30) NOT NULL,
  score NUMERIC(5,2) DEFAULT 0,
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id, product_id, recommended_product_id, recommendation_type)
);

-- T-314: Add expiry_date to store_products for expiry tracking
ALTER TABLE catalog.store_products ADD COLUMN IF NOT EXISTS expiry_date DATE;

-- Indexes
CREATE INDEX idx_ai_alerts_store ON ai.alerts(store_id, created_at DESC);
CREATE INDEX idx_ai_alerts_unread ON ai.alerts(store_id, is_read, is_dismissed) WHERE NOT is_read AND NOT is_dismissed;
CREATE INDEX idx_ai_forecasts_store ON ai.demand_forecasts(store_id, product_id, forecast_date DESC);
CREATE INDEX idx_ai_insights_store ON ai.customer_insights(store_id, customer_phone);
CREATE INDEX idx_ai_anomalies_store ON ai.anomaly_events(store_id, detected_at DESC);
CREATE INDEX idx_ai_recs_store ON ai.product_recommendations(store_id, product_id, score DESC);
CREATE INDEX idx_store_products_expiry ON catalog.store_products(store_id, expiry_date) WHERE expiry_date IS NOT NULL;
