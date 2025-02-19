import { PrismaClient } from "@prisma/client";

// Initialize Prisma client
const prisma = new PrismaClient();

interface Location {
  id: number;
  latitude: number;
  longitude: number;
  city: string;
  state?: string | null;
  country: string;
  placeId: string;
}

interface RouteResponse {
  distance: number;
  duration: number;
  geometry?: string;
}

interface MapboxRoute {
  distance: number;
  duration: number;
  geometry: any;
}

interface MapboxResponse {
  routes: MapboxRoute[];
  [key: string]: any;
}

export class RoutingService {
  private mapboxToken: string;
  private mapboxProfile: string;

  constructor() {
    this.mapboxToken = process.env.MAPBOX_ACCESS_TOKEN || "";
    this.mapboxProfile = process.env.MAPBOX_PROFILE || "mapbox/driving";

    if (!this.mapboxToken) {
      console.warn(
        "MAPBOX_ACCESS_TOKEN not set. Routing functionality will be limited."
      );
    }
  }

  /**
   * Convert meters to kilometers
   */
  static metersToKm(meters: number): number {
    return meters / 1000;
  }

  /**
   * Get route between two locations
   */
  async getRoute(
    origin: Location,
    destination: Location
  ): Promise<RouteResponse> {
    try {
      // First, try to find an existing route in the database
      const existingRoute = await prisma.route.findUnique({
        where: {
          originId_destinationId: {
            originId: origin.id,
            destinationId: destination.id,
          },
        },
      });

      if (existingRoute && existingRoute.isValid) {
        return {
          distance: existingRoute.distanceMeters,
          duration: existingRoute.durationSeconds,
          geometry: existingRoute.routeGeometry || undefined,
        };
      }

      // If no existing route or it's invalid, calculate using Mapbox
      if (this.mapboxToken) {
        return await this.getMapboxRoute(origin, destination);
      }

      // Fallback to direct distance calculation
      return this.getDirectDistance(origin, destination);
    } catch (error) {
      console.error("Error getting route:", error);
      // Fallback to direct distance in case of error
      return this.getDirectDistance(origin, destination);
    }
  }

  /**
   * Calculate route using Mapbox API
   */
  private async getMapboxRoute(
    origin: Location,
    destination: Location
  ): Promise<RouteResponse> {
    try {
      const originCoords = `${origin.longitude},${origin.latitude}`;
      const destCoords = `${destination.longitude},${destination.latitude}`;

      const url = `https://api.mapbox.com/directions/v5/${this.mapboxProfile}/${originCoords};${destCoords}?alternatives=false&geometries=geojson&overview=full&steps=false&access_token=${this.mapboxToken}`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(
          `Mapbox API returned ${response.status}: ${response.statusText}`
        );
      }

      const data = (await response.json()) as MapboxResponse;

      if (!data.routes || data.routes.length === 0) {
        throw new Error("No routes found");
      }

      const route = data.routes[0];

      // Save route to database for future use
      try {
        await this.saveRoute(origin.id, destination.id, route);
      } catch (saveError) {
        console.error("Failed to save route to database:", saveError);
        // Continue even if saving fails
      }

      return {
        distance: route.distance,
        duration: route.duration,
        geometry: JSON.stringify(route.geometry),
      };
    } catch (error) {
      console.error("Mapbox routing error:", error);
      // Fallback to direct distance calculation
      return this.getDirectDistance(origin, destination);
    }
  }

  /**
   * Calculate direct distance between two points using Haversine formula
   */
  private getDirectDistance(
    origin: Location,
    destination: Location
  ): RouteResponse {
    const R = 6371e3; // Earth radius in meters
    const φ1 = this.degToRad(origin.latitude);
    const φ2 = this.degToRad(destination.latitude);
    const Δφ = this.degToRad(destination.latitude - origin.latitude);
    const Δλ = this.degToRad(destination.longitude - origin.longitude);

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    const distance = Math.round(R * c);
    const duration = Math.round(distance / 13.89); // Approximately 50 km/h in m/s

    return {
      distance,
      duration,
    };
  }

  /**
   * Convert degrees to radians
   */
  private degToRad(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * Save route to database
   */
  private async saveRoute(
    originId: number,
    destinationId: number,
    routeData: MapboxRoute
  ): Promise<void> {
    // Skip saving routes for reference locations (negative IDs)
    if (originId < 0 || destinationId < 0) {
      return;
    }

    try {
      await prisma.route.upsert({
        where: {
          originId_destinationId: {
            originId,
            destinationId,
          },
        },
        update: {
          distanceMeters: routeData.distance,
          durationSeconds: routeData.duration,
          routeGeometry: JSON.stringify(routeData.geometry),
          isValid: true,
          updatedAt: new Date(),
        },
        create: {
          originId,
          destinationId,
          distanceMeters: routeData.distance,
          durationSeconds: routeData.duration,
          routeGeometry: JSON.stringify(routeData.geometry),
          isValid: true,
        },
      });
    } catch (error) {
      console.error("Failed to save route to database:", error);
      // Continue even if saving fails
    }
  }
}

// Create and export a singleton instance
export const routingService = new RoutingService();
