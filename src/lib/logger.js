/**
 * lat.audit.v1.3.1 - Hybrid Logging (Local File + Supabase Production)
 */

import { supabase } from './supabase';

const PROXY_URL = 'http://localhost:3001/log';
const APP_VERSION = '1.1.0';
const SCHEMA_VERSION = 'lat.audit.v1.3.0';

/**
 * Core log capture logic. Optimized for machine-learning and forensic auditing.
 */
export const logEvent = async (action, data = {}, options = {}) => {
    // 1. Connectivity & Environment Checks
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

    const loggingEnabled = localStorage.getItem('logging_enabled') === 'true';

    // FORCE AUDIT: Critical business events (AUDIT level) must be logged regardless of the toggle.
    // The toggle mainly controls "noise" like INFO/DEBUG/TRACE.
    if (!loggingEnabled && options.level !== 'AUDIT') return;

    // 2. Stable Identifiers
    const eventId = crypto.randomUUID();
    const isDemo = localStorage.getItem('DEMO_MODE') === 'true';

    // Support for distributed tracing (trace_id and parent_id)
    if (!window.__LAT_TRACE_ID__) window.__LAT_TRACE_ID__ = eventId;
    const currentTraceId = options.trace_id || window.__LAT_TRACE_ID__;

    // 3. Schema v1.3.0 Composition
    const logEntry = {
        schema: SCHEMA_VERSION,
        ts: new Date().toISOString(),
        event_id: eventId,
        trace_id: currentTraceId,
        parent_id: options.parent_id || null,
        level: options.level || 'INFO',
        service: {
            name: 'apt-tracker-web',
            version: APP_VERSION,
            module: options.module || 'core',
            env: process.env.NODE_ENV || 'development'
        },
        event: {
            name: action,
            result_code: options.result_code || 'OK',
            reason: options.reason || null
        },
        actor: options.actor || {
            type: isDemo ? 'bot' : 'user',
            id: 'system',
            name: 'System'
        },
        payload: {
            ...data,
            // Ensure scheduled end is always present if start is provided
            ...(data.scheduled_start ? {
                scheduled: {
                    start: data.scheduled_start,
                    end: data.scheduled_end || new Date(new Date(data.scheduled_start).getTime() + (data.duration_minutes || 30) * 60000).toISOString(),
                    duration_min: data.duration_minutes || 30
                }
            } : {})
        },
        metrics: {
            total_ms: options.total_ms || 0,
            db_ms: options.db_ms || 0,
            decision_ms: options.decision_ms || 0,
            collision_retries: options.collision_retries || 0,
            ...options.metrics
        },
        context: {
            is_demo: isDemo,
            ...options.context
        }
    };

    // 4. Sink Transmission
    try {
        if (isLocal) {
            // Local Mode: Use Twilio Proxy for Filesystem Logging
            await fetch(PROXY_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(logEntry)
            });
        } else {
            // Production Mode: Direct Supabase Insertion
            const { error } = await supabase
                .from('audit_logs')
                .insert({
                    ts: logEntry.ts,
                    schema: logEntry.schema,
                    event_id: logEntry.event_id,
                    trace_id: logEntry.trace_id,
                    parent_id: logEntry.parent_id,
                    level: logEntry.level,
                    service: logEntry.service,
                    event: logEntry.event,
                    actor: logEntry.actor,
                    payload: logEntry.payload,
                    metrics: logEntry.metrics,
                    context: logEntry.context
                });
            if (error) console.warn('[Logger] Production Sink failed:', error);
        }
    } catch (err) {
        console.warn('[Logger] Sink failure:', err);
    }
};

/**
 * Log Management Utilities
 */
export const clearLocalLogs = async () => {
    try {
        const response = await fetch('http://localhost:3001/clear-logs', { method: 'POST' });
        return response.ok;
    } catch (err) {
        console.error('[Logger] Failed to clear local logs:', err);
        return false;
    }
};

/**
 * High-fidelity audit wrapper for appointment lifecycle events.
 */
export const logAppointment = async (appointment, provider, client, creator, actionType = 'CREATE', metrics = {}) => {
    const action = `appointment.${actionType.toLowerCase()}.${metrics.error ? 'fail' : 'success'}`;

    await logEvent(action, {
        business_id: appointment.business_id || creator?.business_id, // DATA ISOLATION
        appointment_id: appointment.id,
        provider_id: provider?.id,
        client_id: client?.id,
        scheduled_start: appointment.scheduled_start,
        duration_minutes: appointment.duration_minutes,
        treatment: appointment.treatment_name || appointment.treatment?.name
    }, {
        level: 'AUDIT',
        module: 'AddAppointmentModal',
        result_code: metrics.error ? `ERR_${metrics.error.code}` : 'SUCCESS_MODIFIED',
        actor: {
            type: creator?.id ? 'user' : 'bot',
            id: creator?.id || 'service.demoboter',
            name: creator?.full_name || 'Demo Seeder Bot',
            role: creator?.role || 'Service'
        },
        metrics: metrics,
        context: {
            reason: creator?.id ? 'manual_operator_entry' : 'stress_test_pulse'
        }
    });
};

/**
 * Production-grade transfer traceability.
 */
export const logTransfer = async (type, data, creator, metrics = {}) => {
    const action = type === 'TRANSFER_REQUEST' ? 'transfer.request' : 'transfer.accept';
    const status = metrics.error ? 'fail' : 'success';

    await logEvent(`${action}.${status}`, data, {
        level: 'AUDIT',
        module: 'TransferEngine',
        result_code: metrics.error ? `ERR_${metrics.error.code}` : 'SUCCESS_TRANSFERRED',
        actor: {
            type: 'user',
            id: creator?.id,
            name: creator?.full_name || creator?.email
        },
        metrics: metrics
    });
};
