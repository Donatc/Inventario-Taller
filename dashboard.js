let graficoEntradasSalidas = null;
let graficoProductos = null;

async function cargarDashboard() {

    try {

        const {
            collection,
            getDocs
        } = await import(
            "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"
        );

        const snapshot =
            await getDocs(
                collection(
                    window.db,
                    "movimientos"
                )
            );

        let entradas = 0;
        let salidas = 0;

        const conteoProductos = {};

        snapshot.forEach(docSnap => {

            const mov =
                docSnap.data();

            if (
                mov.tipo === "ENTRADA"
            ) {

                entradas +=
                    mov.cantidad;

            }

            else if (
                mov.tipo === "SALIDA"
            ) {

                salidas +=
                    mov.cantidad;

                conteoProductos[
                    mov.nombre
                ] =

                    (
                        conteoProductos[
                            mov.nombre
                        ] || 0
                    )

                    +

                    mov.cantidad;

            }

        });

        cargarGraficoEntradasSalidas(
            entradas,
            salidas
        );

        cargarGraficoProductos(
            conteoProductos
        );

    }

    catch(error) {

        console.error(
            "Dashboard:",
            error
        );

    }

}

function cargarGraficoEntradasSalidas(
    entradas,
    salidas
) {

    const canvas =
        document.getElementById(
            "graficoEntradasSalidas"
        );

    if (!canvas) return;

    if (
        graficoEntradasSalidas
    ) {

        graficoEntradasSalidas.destroy();

    }

    graficoEntradasSalidas =
    new Chart(

        canvas,

        {

            type: "pie",

            data: {

                labels: [

                    "Entradas",
                    "Salidas"

                ],

                datasets: [

                    {

                        data: [

                            entradas,
                            salidas

                        ],

                        backgroundColor: [

                            "#2ecc71",
                            "#e74c3c"

                        ]

                    }

                ]

            },

            options: {

                plugins: {

                    title: {

                        display: true,

                        text:
                        "Entradas vs Salidas"

                    }

                }

            }

        }

    );

}

function cargarGraficoProductos(
    conteoProductos
) {

    const canvas =
        document.getElementById(
            "graficoProductos"
        );

    if (!canvas) return;

    if (
        graficoProductos
    ) {

        graficoProductos.destroy();

    }

    const top5 =

        Object.entries(
            conteoProductos
        )

        .sort(
            (
                a,
                b
            ) =>

            b[1] - a[1]

        )

        .slice(
            0,
            5
        );

    graficoProductos =

    new Chart(

        canvas,

        {

            type: "bar",

            data: {

                labels:

                    top5.map(
                        p => p[0]
                    ),

                datasets: [

                    {

                        label:
                        "Salidas",

                        data:

                        top5.map(
                            p => p[1]
                        ),

                        backgroundColor:
                        "#3498db"

                    }

                ]

            },

            options: {

                plugins: {

                    title: {

                        display: true,

                        text:
                        "Top 5 Productos Más Consumidos"

                    }

                },

                responsive: true

            }

        }

    );

}