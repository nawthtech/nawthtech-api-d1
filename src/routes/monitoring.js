// routes/monitoring.js
export default {
  async stats(request, env, ctx) {
    const { searchParams } = new URL(request.url);
    const agentName = searchParams.get('agent');
    const hours = searchParams.get('hours') || 24;

    const monitoring = new AIMonitoring(env);

    if (agentName) {
      const stats = await monitoring.getAgentStats(agentName, hours);
      return Response.json(stats);
    } else {
      // Get all agents stats
      const result = await env.DB.prepare(`
        SELECT 
          agent_name,
          COUNT(*) as total_calls,
          SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful_calls,
          AVG(execution_time_ms) as avg_execution_time,
          SUM(tokens_used) as total_tokens,
          SUM(cost_usd) as total_cost
        FROM ai_agent_metrics
        WHERE created_at >= datetime('now', ?)
        GROUP BY agent_name
      `).bind(`-${hours} hours`).all();

      return Response.json(result.results);
    }
  },

  async health(request, env, ctx) {
    const { searchParams } = new URL(request.url);
    const agentName = searchParams.get('agent');

    const monitoring = new AIMonitoring(env);
    
    if (agentName) {
      const health = await monitoring.checkAgentHealth(agentName);
      return Response.json(health);
    } else {
      // Check health of all agents
      const agents = await env.DB.prepare(`
        SELECT DISTINCT agent_name 
        FROM ai_agent_metrics 
        WHERE created_at >= datetime('now', '-24 hours')
      `).all();

      const healthChecks = await Promise.all(
        agents.results.map(async (agent) => {
          const health = await monitoring.checkAgentHealth(agent.agent_name);
          return {
            agent: agent.agent_name,
            ...health,
          };
        })
      );

      const overallHealth = {
        status: healthChecks.every(h => h.status === 'healthy') ? 'healthy' : 'degraded',
        agents: healthChecks,
        checked_at: new Date().toISOString(),
      };

      return Response.json(overallHealth);
    }
  },

  async llmStats(request, env, ctx) {
    const { searchParams } = new URL(request.url);
    const provider = searchParams.get('provider');
    const hours = searchParams.get('hours') || 24;

    const monitoring = new AIMonitoring(env);
    const stats = await monitoring.getLLMStats(provider, hours);
    
    return Response.json(stats);
  },

  async alerts(request, env, ctx) {
    const { searchParams } = new URL(request.url);
    const resolved = searchParams.get('resolved') === 'true';
    const limit = searchParams.get('limit') || 50;

    let query = 'SELECT * FROM performance_alerts';
    const params = [];

    if (resolved !== undefined) {
      query += ' WHERE resolved = ?';
      params.push(resolved ? 1 : 0);
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    const alerts = await env.DB.prepare(query).bind(...params).all();
    
    return Response.json(alerts.results);
  },

  async metrics(request, env, ctx) {
    const monitoring = new AIMonitoring(env);
    
    // Record a custom metric
    const { agent, operation, executionTime, tokens, cost, success, error } = await request.json();
    
    await monitoring.logAgentMetrics(agent, {
      operation,
      execution_time: executionTime,
      tokens_used: tokens,
      cost_usd: cost,
      success,
      error_message: error,
      metadata: {},
    });

    return Response.json({ success: true, message: 'Metric recorded' });
  },
};