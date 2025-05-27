// delete-problem-route.ts
// Eliminar la ruta problemática ID: 318
import { PrismaClient } from "@prisma/client";

const DATABASE_URL = `postgresql://postgres:xYmKMVWhsNBQWpBRLjBsaAUUlxLGANOa@autorack.proxy.rlwy.net:57115/railway`;

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: DATABASE_URL,
    },
  },
});

async function deleteProblemRoute() {
  try {
    console.log("🗑️  Eliminando ruta problemática ID: 318...");

    // Verificar que existe antes de eliminar
    const route = await prisma.route.findUnique({
      where: { id: 318 },
      include: {
        origin: true,
        destination: true,
      },
    });

    if (route) {
      console.log(`✅ Ruta encontrada:`);
      console.log(`   ${route.origin.city} → ${route.destination.city}`);
      console.log(
        `   Distancia: ${(route.distanceMeters / 1000).toFixed(2)} km`
      );
      console.log(`   Creada: ${route.createdAt}`);

      // Eliminar la ruta
      await prisma.route.delete({
        where: { id: 318 },
      });

      console.log(`✅ Ruta eliminada correctamente`);
      console.log(
        `💡 La próxima cotización recalculará con perfil cycling (~340 km)`
      );
    } else {
      console.log(`❌ Ruta ID: 318 no encontrada`);
    }

    // Verificar que se eliminó
    const deletedRoute = await prisma.route.findUnique({
      where: { id: 318 },
    });

    if (!deletedRoute) {
      console.log(`✅ Confirmado: Ruta eliminada de la base de datos`);
    } else {
      console.log(`❌ Error: La ruta todavía existe`);
    }
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  deleteProblemRoute();
}
