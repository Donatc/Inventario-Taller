async function cargarReporteProveedores() {

    const contenedor =
        document.getElementById(
            "lista-proveedores"
        );

    if (!contenedor) return;

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
                    "recepciones"
                )
            );

        if (snapshot.empty) {

            contenedor.innerHTML =
                "<p>No existen recepciones registradas.</p>";

            return;

        }

        const proveedores = {};

        snapshot.forEach(docSnap => {

            const recepcion =
                docSnap.data();

            const nombreProveedor =
                recepcion.proveedor ||
                "Proveedor desconocido";

            if (
                !proveedores[
                    nombreProveedor
                ]
            ) {

                proveedores[
                    nombreProveedor
                ] = {

                    recepciones: 0,

                    totalCumplimiento: 0

                };

            }

            proveedores[
                nombreProveedor
            ].recepciones++;

            proveedores[
                nombreProveedor
            ].totalCumplimiento +=
                parseFloat(
                    recepcion.cumplimiento
                ) || 0;

        });

        let html = "";

        Object.keys(
            proveedores
        ).forEach(nombre => {

            const proveedor =
                proveedores[nombre];

            const promedio =
                (
                    proveedor.totalCumplimiento /
                    proveedor.recepciones
                ).toFixed(2);

            let estado = "";
            let color = "";

            if (promedio >= 90) {

                estado = "Alta";
                color = "#2ecc71";

            } else if (
                promedio >= 75
            ) {

                estado = "Media";
                color = "#f39c12";

            } else {

                estado = "Baja";
                color = "#e74c3c";

            }

            html += `

            <div
                style="
                    background:#f9f9f9;
                    padding:15px;
                    margin-bottom:15px;
                    border-left:5px solid ${color};
                    border-radius:5px;
                ">

                <h3>
                    ${nombre}
                </h3>

                <p>
                    Recepciones:
                    <strong>
                        ${proveedor.recepciones}
                    </strong>
                </p>

                <p>
                    Cumplimiento promedio:
                    <strong>
                        ${promedio}%
                    </strong>
                </p>

                <p>
                    Confiabilidad:
                    <strong>
                        ${estado}
                    </strong>
                </p>

            </div>

            `;

        });

        contenedor.innerHTML =
            html;

    } catch(error) {

        console.error(
            error
        );

        contenedor.innerHTML =
            "<p>Error al generar el reporte.</p>";

    }

}