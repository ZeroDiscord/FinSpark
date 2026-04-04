package com.finspark.tracking;

public class AnalyticsConfig {
    public final String tenantId;
    public final String deploymentType;
    public final String endpoint;
    public final String channel;

    public AnalyticsConfig(String tenantId, String deploymentType, String endpoint, String channel) {
        this.tenantId = tenantId;
        this.deploymentType = deploymentType;
        this.endpoint = endpoint;
        this.channel = channel;
    }
}
