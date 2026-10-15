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

        const ranking = [];

        Object.keys(proveedores).forEach(nombre => {

            const proveedor =
                proveedores[nombre];

            const promedio =
                (
                    proveedor.totalCumplimiento /
                    proveedor.recepciones
                ).toFixed(2);

            ranking.push({

                nombre,

                recepciones:
                    proveedor.recepciones,

                promedio:
                    parseFloat(promedio)

            });

        });

        ranking.sort(
            (a, b) =>
                b.promedio - a.promedio
        );

        const mejorProveedor =
            ranking[0];

        let htmlRanking = `

        <div
        style="
        background:#f8fff5;
        border:2px solid #2ecc71;
        padding:15px;
        border-radius:6px;
        margin-bottom:20px;
        ">

        <h2>
        🏆 Mejor Proveedor
        </h2>

        <p>

        <strong>
        ${mejorProveedor.nombre}
        </strong>

        </p>

        <p>

        Cumplimiento promedio:

        <strong>
        ${mejorProveedor.promedio}%
        </strong>

        </p>

        </div>

        <h2>
        📊 Ranking
        </h2>

        `;

        ranking.forEach(
            (
                proveedor,
                index
            ) => {

                let medalla = "";

                if (index === 0)
                    medalla = "🥇";

                else if (index === 1)
                    medalla = "🥈";

                else if (index === 2)
                    medalla = "🥉";

                else
                    medalla =
                    `${index + 1}.`;

                htmlRanking += `

                <div
                style="
                    background:#f4f4f4;
                    padding:10px;
                    margin-bottom:10px;
                    border-radius:5px;
                ">

                    <strong>

                        ${medalla}
                        ${proveedor.nombre}

                    </strong>

                    <br>

                    ${proveedor.promedio}%

                </div>

                `;

            }
        );

        let htmlDetalle = "";

        ranking.forEach(
            proveedor => {

                let estado = "";
                let color = "";

                if (
                    proveedor.promedio >= 90
                ) {

                    estado = "Alta";
                    color = "#2ecc71";

                }

                else if (
                    proveedor.promedio >= 75
                ) {

                    estado = "Media";
                    color = "#f39c12";

                }

                else {

                    estado = "Baja";
                    color = "#e74c3c";

                }

                htmlDetalle += `

                <div
                    style="
                        background:#f9f9f9;
                        padding:15px;
                        margin-bottom:15px;
                        border-left:5px solid ${color};
                        border-radius:5px;
                    ">

                    <h3>

                        ${proveedor.nombre}

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
                        ${proveedor.promedio}%
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

            }
        );

        contenedor.innerHTML = `

        <div
        style="
        display:flex;
        flex-wrap:wrap;
        gap:20px;
        align-items:flex-start;
        ">

            <div style=" flex:1; min-width:280px;">

                ${htmlRanking}

            </div>

            <div style="flex:2; min-width:380px;">
            
                
            

                ${htmlDetalle}

            </div>

        </div>

        `;

    } catch(error) {

        console.error(
            error
        );

        contenedor.innerHTML =
            "<p>Error al generar el reporte.</p>";

    }

}