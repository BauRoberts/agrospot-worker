// clean-route.ts
// Script para limpiar la ruta específica Jesús María - Sarmiento
import { PrismaClient } from "@prisma/client";

// Construir la URL usando las variables de Railway
const DATABASE_URL = `postgresql://postgres:xYmKMVWhsNBQWpBRLjBsaAUUlxLGANOa@autorack.proxy.rlwy.net:57115/railway`;

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: DATABASE_URL,
    },
  },
});

async function cleanRoute() {
  try {
    console.log("🧹 Limpiando ruta Jesús María - Sarmiento...");
    console.log(
      `📡 Conectando a: ${DATABASE_URL.replace(/:[^:]*@/, ":****@")}`
    );

    // Eliminar la ruta específica
    const result = await prisma.route.deleteMany({
      where: {
        OR: [
          {
            originId: 14, // Jesús María
            destinationId: 100, // Sarmiento
          },
          {
            originId: 100, // Sarmiento
            destinationId: 14, // Jesús María
          },
        ],
      },
    });

    console.log(`✅ Eliminadas ${result.count} rutas`);

    // Verificar que se eliminó
    const remaining = await prisma.route.findMany({
      where: {
        OR: [
          {
            originId: 14,
            destinationId: 100,
          },
          {
            originId: 100,
            destinationId: 14,
          },
        ],
      },
    });

    if (remaining.length === 0) {
      console.log("✅ Ruta eliminada correctamente");
      console.log(
        "💡 Ahora la próxima cotización recalculará con el perfil cycling"
      );
    } else {
      console.log(`❌ Todavía quedan ${remaining.length} rutas`);
    }
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  cleanRoute();
}
