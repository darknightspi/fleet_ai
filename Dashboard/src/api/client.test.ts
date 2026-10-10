import { afterEach, describe, expect, it, vi } from "vitest";
import { FlaskFleetApi } from "./client";

afterEach(() => vi.unstubAllGlobals());

describe("Flask fleet adapter", () => {
  it("maps only the backend fleet contract and leaves absent data unavailable", async () => {
    const health = { status: "healthy", model_loaded: true, mock_mode: false, artifact_path: "private/path" };
    const trucks = [{
      id: "001", model: "Freightliner Cascadia", duty: "heavy",
      ambient_temp_c: 26, coolant_temp_c: 36.2, engine_rpm: 1520,
      engine_torque_nm: 42.5, operating_wear_min: 50,
      failure_predicted: false, failure_probability: 0.1234,
      risk_level: "LOW", model_in_range: true,
    }];
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(health), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(trucks), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const snapshot = await new FlaskFleetApi().getSnapshot();
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/api/health", "/api/fleet"]);
    expect(snapshot.mode).toBe("backend");
    expect(snapshot.backend_model_mode).toBe("model");
    expect(snapshot.vehicles[0].status?.failure_prob).toBe(0.1234);
    expect(snapshot.vehicles[0].status?.risk_band).toBe("Normal");
    expect(snapshot.vehicles[0].model_inputs).toEqual({
      ambient_temp_c: 26, coolant_temp_c: 36.2, engine_rpm: 1520,
      engine_torque_nm: 42.5, operating_wear_min: 50, duty: "heavy",
    });
    expect(snapshot.vehicles[0].source).toBe("Simulated");
    expect(snapshot.vehicles[0].readings).toEqual([]);
    expect(snapshot.vehicles[0].location).toBeNull();
    expect(snapshot.vehicles[0].fuel_status).toBeNull();
    expect(snapshot.alerts).toEqual([]);
    expect(snapshot.work_orders).toEqual([]);
  });

  it("surfaces backend HTTP failures to the UI", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("unavailable", { status: 503, statusText: "Unavailable" })));
    await expect(new FlaskFleetApi().getSnapshot()).rejects.toThrow("503 Unavailable");
  });

  it("preserves an explicit hardware source from the backend", async () => {
    const truck = {
      id: "101", device_id: "esp32:rc:alpha", model: "RC car", duty: "unknown", source: "Hardware",
      connectivity: "Online", last_seen: "2026-10-10T05:00:00Z",
      telemetry: { speed_kmph: 12.5, engine_rpm: 850 }, telemetry_seq: 1,
      ambient_temp_c: null, coolant_temp_c: null, engine_torque_nm: null, operating_wear_min: null,
      failure_predicted: null, failure_probability: null,
      risk_level: "UNKNOWN", model_in_range: null,
    };
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "healthy", model_loaded: true, mock_mode: false }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([truck]), { status: 200 })));

    const snapshot = await new FlaskFleetApi().getSnapshot();
    expect(snapshot.vehicles[0].source).toBe("Hardware");
    expect(snapshot.vehicles[0].vehicle_id).toBe("101");
    expect(snapshot.vehicles[0].device_id).toBe("esp32:rc:alpha");
    expect(snapshot.vehicles[0].connectivity).toBe("Online");
    expect(snapshot.vehicles[0].readings[0].speed_kmph).toBe(12.5);
    expect(snapshot.vehicles[0].status?.failure_prob).toBeNull();
  });
});
