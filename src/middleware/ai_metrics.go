// أضف تكامل Sentry
import (
    "github.com/getsentry/sentry-go"
)

func AIMetricsMiddleware() gin.HandlerFunc {
    return func(c *gin.Context) {
        start := time.Now()
        
        // Start Sentry transaction
        span := sentry.StartSpan(c.Request.Context(), "ai.request",
            sentry.WithTransactionName(fmt.Sprintf("ai.%s", c.Request.URL.Path)),
        )
        defer span.Finish()
        
        c.Next()
        
        // Record metrics
        duration := time.Since(start)
        status := c.Writer.Status()
        
        // Send to Sentry
        sentry.ConfigureScope(func(scope *sentry.Scope) {
            scope.SetExtra("ai_request_duration", duration.Milliseconds())
            scope.SetExtra("ai_response_status", status)
            scope.SetTag("ai_endpoint", c.Request.URL.Path)
        })
    }
}