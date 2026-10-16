let streamActivo = null;
let modoActualEscanner = null; 
let codigoEscaneadoTemp = "";

// Variables globales para la validación con XML
let ordenCompraActual = {};
let productosFisicos = {};
let xmlCargadoValido = false;
let productosXMLDetectados = [];
let proveedorActual = "";
let folioActual = "";
let fechaFacturaActual = "";

function cambiarSeccion(seccionId, evento) {
  document.querySelectorAll('.section-content').forEach(sec => sec.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(tab => tab.classList.remove('active'));

  document.getElementById(seccionId).classList.add('active');
  evento.currentTarget.classList.add('active');

  detenerCamara();
  if (seccionId === 'entradas') {
    if (xmlCargadoValido) {
      iniciarCamara('entrada');
    }
  } else if (seccionId === 'salidas') {
    iniciarCamara('salida');
  } else if (seccionId === 'actual') {
    cambiarVistaInventario('stock');
  } else if (seccionId === 'mercancia') {
    cargarHistorialMercancia();
  } else if (seccionId === 'usuarios') {
    cargarUsuarios();
  }
}

// Control de vistas en Inventario (Stock / Catálogo QR General)
function cambiarVistaInventario(vista) {
  const btnStock = document.getElementById("btn-vista-stock");
  const btnCatalogo = document.getElementById("btn-vista-catalogo");
  const divStock = document.getElementById("subseccion-stock");
  const divCatalogo = document.getElementById("subseccion-catalogo");

  if (!btnStock || !btnCatalogo || !divStock || !divCatalogo) return;

  if (vista === 'stock') {
    btnStock.style.background = "#3498db";
    btnCatalogo.style.background = "#95a5a6";
    divStock.style.display = "block";
    divCatalogo.style.display = "none";
    cargarInventarioActual();
  } else {
    btnStock.style.background = "#95a5a6";
    btnCatalogo.style.background = "#3498db";
    divStock.style.display = "none";
    divCatalogo.style.display = "block";
    cargarCatalogoGeneralQR();
  }
}

// 1. PROCESAR EL ARCHIVO XML DE LA ORDEN DE COMPRA
async function procesarXMLOrdenCompra(event) {
  const archivo = event.target.files[0];
  if (!archivo) return;

  const lector = new FileReader();
  lector.onload = async function(e) {
    try {
      const contenidoTexto = e.target.result;
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(contenidoTexto, "text/xml");
      const emisores = xmlDoc.getElementsByTagName( "cfdi:Emisor" );
      if (emisores.length > 0) {
          proveedorActual =emisores[0].getAttribute( "Nombre" ) || "";
      }

      const comprobante = xmlDoc.getElementsByTagName("cfdi:Comprobante")[0];

      if (comprobante) {
          folioActual = comprobante.getAttribute( "Folio" ) || "";
          fechaFacturaActual = comprobante.getAttribute( "Fecha" ) || "";
      }

      let items = xmlDoc.getElementsByTagName("cfdi:Concepto");
      if (items.length === 0) items = xmlDoc.getElementsByTagName("Concepto");
      if (items.length === 0) items = xmlDoc.getElementsByTagName("Item");
      if (items.length === 0) items = xmlDoc.getElementsByTagName("producto");

      ordenCompraActual = {};
      productosFisicos = {};
      const productosNoRegistrados = [];
      let htmlResumen = "<strong>Productos en la Orden:</strong><ul style='margin: 5px 0 0 20px; padding:0;'>";

      if (items.length > 0) {
        const {
              doc,
              getDoc
          } = await import(
              "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"
          );
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const codigo = item.getAttribute("NoIdentificacion") || item.getAttribute("codigo") || `SKU-${i+1}`;
          const descripcion = item.getAttribute("Descripcion") || item.getAttribute("nombre") || "Artículo sin descripción";
          const cantidad = parseFloat(item.getAttribute("Cantidad") || item.getAttribute("cantidad") || 1);

          ordenCompraActual[codigo] = {
            nombre: descripcion,
            cantidadEsperada: cantidad,
            cantidadEscaneada: 0
          };
          productosFisicos[codigo] = {

              codigo: codigo,
              nombre: descripcion,
              esperados: cantidad,
              recibidos: 0

          };
           
          const productoRef =
              doc(
                  window.db,
                  "productos",
                  codigo
              );
           
          const productoSnap =
              await getDoc(
                  productoRef
              );
           
          if (!productoSnap.exists()) {
           
              productosNoRegistrados.push(
                  `${codigo} - ${descripcion}`
              );
           
          }

          htmlResumen += `<li><b>${codigo}</b> - ${descripcion} (Esperados: <b>${cantidad}</b>)</li>`;
        }
        if (
          productosNoRegistrados.length > 0
      ) {
       
          alert(`Se detectaron productos que no existen en el catálogo:
       
      
       
      ${productosNoRegistrados.join("\n")}
       
      Favor de comunicarse con el administrador para validar los productos antes de continuar.` );
       
          ordenCompraActual = {};
          productosFisicos = {};
          document.getElementById( "lista-productos-fisicos" ).innerHTML = "<p style='color:#7f8c8d;'>Esperando carga de XML...</p>";
          xmlCargadoValido = false;
          document.getElementById( "resumen-xml" ).innerHTML = "<p style='color:#7f8c8d;'>Ninguna orden cargada aún.</p>";
          document.getElementById( "contenedor-escanner-entradas" ).style.display = "none"; 
          document.getElementById( "btnFinalizarRecepcion" ).style.display = "none"; 
          detenerCamara();
       document.getElementById( "file-xml" ).value = "";
       return;
      }

      } else {
        alert("No se detectaron nodos de productos estándar (Concepto/Item) en el XML.");
        return;
      }
      

      htmlResumen += "</ul>";
      htmlResumen += ` <hr> <p> <b>Proveedor:</b> ${proveedorActual} </p> <p> <b>Folio:</b> ${folioActual}
      </p> <p> <b>Fecha Factura:</b> ${fechaFacturaActual} </p> `;
      
      document.getElementById("resumen-xml").innerHTML = htmlResumen;
      document.getElementById("contenedor-escanner-entradas").style.display = "block";
      xmlCargadoValido = true;
      actualizarListaFisica();
      document.getElementById( "btnFinalizarRecepcion" ).style.display = "inline-block";
      
      iniciarCamara('entrada');
      alert("¡Orden de compra cargada con éxito! Ya puedes escanear.");

    } catch (error) {
      console.error("Error al parsear el XML:", error);
      alert("Hubo un error al leer el archivo XML.");
    }
  };
  lector.readAsText(archivo);
}
function actualizarListaFisica() {

    const contenedor =
        document.getElementById(
            "lista-productos-fisicos"
        );

    let html = `
        <table
        style="
            width:100%;
            border-collapse:collapse;
        ">
    `;

    html += `
        <tr>
            <th>SKU</th>
            <th>Producto</th>
            <th>Recibidos</th>
        </tr>
    `;

    Object.values(
        productosFisicos
    ).forEach(prod => {

        let color = "#e74c3c";

        if (
            prod.recibidos > 0
        ) {

            color = "#f39c12";

        }

        if (
            prod.recibidos >=
            prod.esperados
        ) {

            color = "#2ecc71";

        }

        html += `

        <tr>

            <td>
                ${prod.codigo}
            </td>

            <td>
                ${prod.nombre}
            </td>

            <td
                style="
                    color:${color};
                    font-weight:bold;
                ">

                ${prod.recibidos}
                /
                ${prod.esperados}

            </td>

        </tr>

        `;
    });

    html += "</table>";

    contenedor.innerHTML =
        html;
}
function finalizarRecepcion() {
    const completos = [];
    const parciales = [];
    const noRecibidos = [];
    const sobrantes = [];

    Object.values(
        productosFisicos
    ).forEach(prod => {

        if (
            prod.recibidos ===
            prod.esperados
        ) {

            completos.push(prod);

        }

        else if (
            prod.recibidos === 0
        ) {

            noRecibidos.push(prod);

        }

        else if (
            prod.recibidos >
            prod.esperados
        ) {

            sobrantes.push(prod);

        }

        else {

            parciales.push(prod);

        }

    });

    let mensaje =

`RESUMEN DE RECEPCIÓN


✅ COMPLETOS

`;

    completos.forEach(prod => {

        mensaje +=
`${prod.codigo} ${prod.nombre} ${prod.recibidos}/${prod.esperados}
`;
    });

    mensaje +=

`\n⚠ PARCIALES\n\n`;

    parciales.forEach(prod => {

        mensaje +=
`${prod.codigo} ${prod.nombre} ${prod.recibidos}/${prod.esperados}
`;
    });

    mensaje +=

`\n❌ NO RECIBIDOS\n\n`;

    noRecibidos.forEach(prod => {

        mensaje +=
`${prod.codigo} ${prod.nombre} ${prod.recibidos}/${prod.esperados}
`;
    });

    mensaje +=

`\n🔵 SOBRANTES\n\n`;

    sobrantes.forEach(prod => {

        mensaje +=
`${prod.codigo} ${prod.nombre} ${prod.recibidos}/${prod.esperados}
`;
    });

    mensaje +=

`\n\n¿Deseas registrar esta recepción?`;

    const confirmar =

        confirm(mensaje);

    if (confirmar) {

        registrarRecepcionCompleta();

    }

}

async function registrarRecepcionCompleta() {

    try {

        const {
            doc,
            getDoc,
            setDoc,
            updateDoc,
            collection,
            addDoc
        } = await import(
            "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"
        );

        let completos = 0;
        let parciales = 0;
        let noRecibidos = 0;
        let sobrantes = 0;

        const detalleProductos = [];

        for (const producto of Object.values(productosFisicos)) {

            const recibidos = producto.recibidos;
            const esperados = producto.esperados;

            let estado = "";

            if (recibidos === esperados) {

                estado = "COMPLETO";
                completos++;

            } else if (recibidos === 0) {

                estado = "NO RECIBIDO";
                noRecibidos++;

            } else if (recibidos > esperados) {

                estado = "SOBRANTE";
                sobrantes++;

            } else {

                estado = "PARCIAL";
                parciales++;

            }

            detalleProductos.push({

                codigo: producto.codigo,

                nombre: producto.nombre,

                esperados: esperados,

                recibidos: recibidos,

                estado: estado

            });

            // Solo actualiza inventario
            // si realmente llegaron piezas

            if (recibidos > 0) {

                const prodRef = doc(
                    window.db,
                    "productos",
                    producto.codigo
                );

                const prodSnap =
                    await getDoc(prodRef);

                if (prodSnap.exists()) {

                    const stockActual =
                        prodSnap.data().stock || 0;

                    await updateDoc(
                        prodRef,
                        {
                            stock:
                                stockActual +
                                recibidos
                        }
                    );

                } else {

                    await setDoc(
                        prodRef,
                        {
                            codigo:
                                producto.codigo,

                            nombre:
                                producto.nombre,

                            stock:
                                recibidos
                        }
                    );

                }

                await addDoc(

                    collection(
                        window.db,
                        "movimientos"
                    ),

                    {

                        tipo: "ENTRADA",

                        codigo:
                            producto.codigo,

                        nombre:
                            producto.nombre,

                        cantidad:
                            recibidos,

                        usuario:
                            window.usuarioActual?.nombre ||
                            "Desconocido",

                        rol:
                            window.usuarioActual?.rol ||
                            "N/A",

                        fecha:
                            new Date()
                            .toLocaleString(),

                        timestamp:
                            Date.now()

                    }

                );

            }

        }

        const totalProductos =
            detalleProductos.length;

        const cumplimiento =
            totalProductos > 0
            ? (
                (completos /
                totalProductos) * 100
            ).toFixed(2)
            : 0;

        // REPORTE DE RECEPCIÓN

        await addDoc(

            collection(
                window.db,
                "recepciones"
            ),

            {
                proveedor:
                    proveedorActual,

                folio:
                    folioActual,

                fechaFactura:
                    fechaFacturaActual,
                fecha:
                    new Date()
                    .toLocaleString(),

                timestamp:
                    Date.now(),

                usuario:
                    window.usuarioActual?.nombre,

                totalProductos,
                completos,
                parciales,
                noRecibidos,
                sobrantes,
                cumplimiento,

                productos:
                    detalleProductos
            }
        );
        alert( "Recepción registrada correctamente." );
            
        // Limpiar pantalla
        productosFisicos = {};
        ordenCompraActual = {};
        xmlCargadoValido = false;

        document.getElementById( "lista-productos-fisicos" ).innerHTML = "<p>Recepción terminada.</p>";
        document.getElementById( "resumen-xml" ).innerHTML = "<p style='color:#7f8c8d;'>Ninguna orden cargada aún.</p>";
        document.getElementById( "contenedor-escanner-entradas" ).style.display = "none";
        document.getElementById( "btnFinalizarRecepcion" ).style.display = "none";
        detenerCamara();

    } catch(error) {
        console.error(error);
        alert(
            "Error al registrar la recepción."
        ); }
}

// 2. GUARDAR NUEVO PRODUCTO EN FIRESTORE (Sin mostrar QR en esta pantalla)
async function guardarNuevoProducto() {
  const codigo = document.getElementById("codigo-reg").value.trim();
  const nombre = document.getElementById("nombre-reg").value.trim();
  
  if (!codigo || !nombre) {
    alert("Por favor completa el código y el nombre del producto.");
    return;
  }

  try {
    const { doc, setDoc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    
    await setDoc(doc(window.db, "productos", codigo), {
      codigo: codigo,
      nombre: nombre,
      stock: 0,
      stockMinimo: 0,
      fechaCreacion: new Date()
    });

    alert(`¡Producto "${nombre}" registrado con éxito! Su código QR ya está disponible en el Inventario General.`);
    
    // Limpiamos los campos
    document.getElementById("codigo-reg").value = "";
    document.getElementById("nombre-reg").value = "";
    
  } catch (error) {
    console.error("Error al guardar producto: ", error);
    alert("Hubo un error al guardar en la base de datos.");
  }
}

function iniciarCamara(tipo) {
  modoActualEscanner = tipo;
  const videoElement = document.getElementById(tipo === 'entrada' ? 'video-entrada' : 'video-salida');

  navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
    .then(stream => {
      streamActivo = stream;
      videoElement.srcObject = stream;
      videoElement.play();
      requestAnimationFrame(() => bucleEscaneo(tipo));
    })
    .catch(err => {
      alert("Error al acceder a la cámara: " + err);
    });
}

function detenerCamara() {
  if (streamActivo) {
    streamActivo.getTracks().forEach(track => track.stop());
    streamActivo = null;
  }
}

function bucleEscaneo(tipo) {
  if (modoActualEscanner !== tipo) return;

  const videoElement = document.getElementById(tipo === 'entrada' ? 'video-entrada' : 'video-salida');
  const resultadoElement = document.getElementById(tipo === 'entrada' ? 'resultado-entrada' : 'resultado-salida');

  if (videoElement.readyState === videoElement.HAVE_ENOUGH_DATA) {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;
    context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, canvas.width, canvas.height);

    if (code) {
      codigoEscaneadoTemp = code.data;
      resultadoElement.textContent = "¡Código detectado: " + code.data + "!";
      
      if (tipo === 'entrada') {
        document.getElementById('lbl-prod-entrada').textContent = code.data;
        
        if (ordenCompraActual[code.data]) {
          document.getElementById('lbl-cant-xml').textContent = ordenCompraActual[code.data].cantidadEsperada;
          document.getElementById('lbl-cant-scan').textContent = ordenCompraActual[code.data].cantidadEscaneada;
          document.getElementById('cantidad-entrada').value = (ordenCompraActual[code.data].cantidadEsperada - ordenCompraActual[code.data].cantidadEscaneada) > 0 ? 
            (ordenCompraActual[code.data].cantidadEsperada - ordenCompraActual[code.data].cantidadEscaneada) : 1;
        } else {
          document.getElementById('lbl-cant-xml').textContent = "No listado en XML";
          document.getElementById('lbl-cant-scan').textContent = "-";
        }

        document.getElementById('panel-confirmar-entrada').style.display = 'block';
      } else {
        document.getElementById('lbl-prod-salida').textContent = code.data;
        document.getElementById('panel-confirmar-salida').style.display = 'block';
      }
      return; 
    }
  }

  if (streamActivo) {
    requestAnimationFrame(() => bucleEscaneo(tipo));
  }
}

function reiniciarEscaneo(tipo) {
  if (tipo === 'entrada') {
    document.getElementById('resultado-entrada').textContent = "Esperando escaneo de entrada...";
    document.getElementById('panel-confirmar-entrada').style.display = 'none';
  } else {
    document.getElementById('resultado-salida').textContent = "Esperando escaneo de salida...";
    document.getElementById('panel-confirmar-salida').style.display = 'none';
  }
  codigoEscaneadoTemp = "";
  requestAnimationFrame(() => bucleEscaneo(tipo));
}

// 3. CONFIRMAR ENTRADA EN LA NUBE
async function confirmarEntrada() {
  const cantidad = parseInt(document.getElementById("cantidad-entrada").value);
  if (!cantidad || cantidad <= 0) return alert("Ingresa una cantidad válida.");

  if (xmlCargadoValido && !ordenCompraActual[codigoEscaneadoTemp] ) 
    { alert( `El producto "${codigoEscaneadoTemp}" no pertenece a la Orden de Compra.` );
      reiniciarEscaneo('entrada'); return;
      
  } else if (xmlCargadoValido && ordenCompraActual[codigoEscaneadoTemp]) {
    ordenCompraActual[codigoEscaneadoTemp].cantidadEscaneada += cantidad;
  }
  if (
      productosFisicos[
          codigoEscaneadoTemp
      ]
  ) {
   
      productosFisicos[
          codigoEscaneadoTemp
      ].recibidos += cantidad;
   
      actualizarListaFisica();
  }

  const nombreProducto =
      ordenCompraActual[codigoEscaneadoTemp]?.nombre ||
      codigoEscaneadoTemp;

  alert(
      `Se registraron físicamente ${cantidad} unidades de "${nombreProducto}".`
  );

  reiniciarEscaneo('entrada');
}

// 4. CONFIRMAR SALIDA EN LA NUBE
async function confirmarSalida() {
  const cantidad = parseInt(document.getElementById("cantidad-salida").value);
  if (!cantidad || cantidad <= 0) return alert("Ingresa una cantidad válida.");

  try {
    const { doc, getDoc, updateDoc, collection, addDoc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    
    const prodRef = doc(window.db, "productos", codigoEscaneadoTemp);
    const prodSnap = await getDoc(prodRef);

    let nombreProducto = codigoEscaneadoTemp;
    if (prodSnap.exists()) {
      const data = prodSnap.data();
      nombreProducto = data.nombre;
      const stockActual = data.stock || 0;
      
      if (stockActual < cantidad) {
        alert(`¡Advertencia! No hay suficiente stock. Stock actual: ${stockActual}`);
        return;
      }

      await updateDoc(prodRef, { stock: stockActual - cantidad });
    }

    await addDoc(collection(window.db, "movimientos"), {
      tipo: "SALIDA",
      codigo: codigoEscaneadoTemp,
      nombre: nombreProducto,
      cantidad: cantidad,
      usuario: window.usuarioActual?.nombre || "Desconocido",
      rol: window.usuarioActual?.rol || "N/A",
      fecha: new Date().toLocaleString(),
      timestamp: Date.now()
    });

    alert(`[Salida Registrada] Se retiraron ${cantidad} unidades de "${nombreProducto}".`);
    // ACTUALIZA EL CONTADOR DE PRODUCTOS CRÍTICOS 
    await cargarInventarioActual();
    reiniciarEscaneo('salida');
} catch (error) {
    console.error("Error al registrar salida:", error);
    alert("Error al procesar la salida.");
  }
}


// 5. CARGAR INVENTARIO ACTUAL (Stock)
async function cargarInventarioActual() {
  const contenedor = document.getElementById("lista-inventario");
  if (!contenedor) return;
  contenedor.innerHTML = "<p>Cargando inventario desde la nube...</p>";

  try {
    const { collection, getDocs } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    const querySnapshot = await getDocs(collection(window.db, "productos"));

    if (querySnapshot.empty) {
      contenedor.innerHTML = "<p style='color: #7f8c8d; font-style: italic;'>No hay productos registrados.</p>";
      return;
    }

    let html = "<ul style='list-style: none; padding: 0;'>";
    let contadorConStock = 0;
    let productosCriticos = [];

    querySnapshot.forEach((doc) => {
      const prod = doc.data();
      const stock = prod.stock || 0;
      const stockMinimo =
          prod.stockMinimo || 0;
       
      if (
          stockMinimo > 0 &&
          stock <= stockMinimo
      ) {
       
          productosCriticos.push({
       
              nombre:
                  prod.nombre,
       
              codigo:
                  prod.codigo,
       
              stock:
       
                  stock,
       
              stockMinimo:
       
                  stockMinimo
       
          });
       
      }

      // FILTRO: Solo mostrar si el stock es mayor a 0
      if (stock > 0) {
        contadorConStock++;
        html += `<li style='background: #f9f9f9; margin-bottom: 8px; padding: 10px; border-radius: 4px; border-left: 4px solid #3498db;'>
          <strong>${prod.nombre}</strong> (${prod.codigo})<br>
          Stock Actual: <span style='font-size: 1.1em; color: #2c3e50; font-weight: bold;'>${stock}</span>
        </li>`;
      }
    });

    let htmlAlerta = "";
     
    if (
     
        window.usuarioActual?.rol === "admin"
     
        &&
     
        productosCriticos.length > 0
     
    ) {
     
        htmlAlerta += `
     
        <div
        style="
            background:#fff5f5;
            border-left:5px solid #e74c3c;
            padding:15px;
            margin-bottom:20px;
            border-radius:5px;
        ">
     
            <h3>
                🔴 Productos por Reabastecer
                (${productosCriticos.length})
            </h3>
     
            <p>
                Se detectaron <strong>${productosCriticos.length}</strong>
                    producto(s) que alcanzaron su stock mínimo.
            </p>
        `;
     
        productosCriticos.forEach(prod => {
     
            htmlAlerta += `
     
            <div
            style="
                margin-bottom:12px;
            ">
     
                <strong>
     
                    ${prod.nombre}
     
                </strong>
     
                <br>
     
                Código:
                ${prod.codigo}
     
                <br>
     
                Stock actual:
                ${prod.stock}
     
                <br>
     
                Stock mínimo:
                ${prod.stockMinimo}
     
            </div>
     
            `;
     
        });
     
        htmlAlerta += `</div>`;
    }
    const btnStock =
        document.getElementById(
            "btn-vista-stock"
        );
     
    if (btnStock) {
     
        if (
            window.usuarioActual?.rol === "admin"
            &&
            productosCriticos.length > 0
        ) {
     
            btnStock.innerHTML =
                `🔴 Stock Actual (${productosCriticos.length})`;
     
        } else {
     
            btnStock.innerHTML =
                "Stock Actual";
     
        }
     
    }

    if (contadorConStock === 0) {
      contenedor.innerHTML = "<p style='color: #7f8c8d; font-style: italic;'>No hay productos con stock disponible en este momento (todos están en 0).</p>";
      return;
    }

    html += "</ul>"; contenedor.innerHTML = htmlAlerta + html;
  } catch (error) {
    console.error("Error cargando inventario:", error);
    contenedor.innerHTML = "<p style='color: red;'>Error al cargar las existencias.</p>";
  }
}

// 5.1. CARGAR CATÁLOGO GENERAL Y GENERAR SUS QR
async function cargarCatalogoGeneralQR() {
  const contenedor = document.getElementById("lista-catalogo-qr");
  if (!contenedor) return;
  contenedor.innerHTML = "<p>Cargando catálogo general...</p>";

  try {
    const { collection, getDocs } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    const querySnapshot = await getDocs(collection(window.db, "productos"));

    if (querySnapshot.empty) {
      contenedor.innerHTML = "<p style='color: #7f8c8d; font-style: italic;'>No hay productos registrados en el sistema.</p>";
      return;
    }

    let html = "<div style='display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 15px;'>";
    const productosArray = [];
    querySnapshot.forEach((docSnap) => {
      productosArray.push(docSnap.data());
    });

    productosArray.forEach((prod, index) => {
      html += `
        <div style='background: #fff; border: 1px solid #ddd; padding: 12px; border-radius: 6px; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.05);'>
          <h4 style='margin: 0 0 5px 0; color: #2c3e50;'>${prod.nombre}</h4>
          <p style='margin: 0 0 10px 0; font-size: 0.9em; color: #7f8c8d;'>SKU: <b>${prod.codigo}</b></p>
          <div style='display: flex; justify-content: center; margin-bottom: 8px;'>
            <canvas id='qr-catalogo-${index}'></canvas>
          </div>
          <p style='margin:0; font-size:0.85em;'> Stock: ${prod.stock || 0} </p> <p style='margin-top:8px;'> Mínimo: <input type="number" min="0" value="${prod.stockMinimo || 0}"
           id="stock-min-${prod.codigo}" style=" width:70px; margin-left:5px; "> </p> <button style=" margin-top:8px; font-size:0.8em; " onclick="guardarStockMinimo('${prod.codigo}')"> Guardar mínimo </button>
        </div>
      `;
    });

    html += "</div>";
    contenedor.innerHTML = html;

    productosArray.forEach((prod, index) => {
      const canvasElement = document.getElementById(`qr-catalogo-${index}`);
      if (canvasElement && window.QRCode) {
        QRCode.toCanvas(canvasElement, prod.codigo, { width: 130 }, function (err) {
          if (err) console.error("Error generando QR para " + prod.codigo, err);
        });
      }
    });

  } catch (error) {
    console.error("Error cargando catálogo general:", error);
    contenedor.innerHTML = "<p style='color: red;'>Error al cargar el catálogo general.</p>";
  }
}

// 6. CARGAR HISTORIAL DE MERCANCÍA / MOVIMIENTOS
function obtenerSemana(fecha) {

    const date = new Date(fecha);

    const primerDiaAnio =
        new Date(
            date.getFullYear(),
            0,
            1
        );

    const dias =
        Math.floor(
            (date - primerDiaAnio) /
            86400000
        );

    const semana =
        Math.ceil(
            (dias +
            primerDiaAnio.getDay() +
            1) / 7
        );

    return {
        anio:
            date.getFullYear(),

        semana:
            semana
    };

}
function obtenerRangoSemana(timestamp) {

    const fecha = new Date(timestamp);

    const dia =
        fecha.getDay();

    const diferenciaInicio =
        dia === 0 ? -6 : 1 - dia;

    const inicioSemana =
        new Date(fecha);

    inicioSemana.setDate(
        fecha.getDate() +
        diferenciaInicio
    );

    const finSemana =
        new Date(inicioSemana);

    finSemana.setDate(
        inicioSemana.getDate() + 6
    );

    const opciones = {
        day: "2-digit",
        month: "short"
    };

    const inicio =
        inicioSemana.toLocaleDateString(
            "es-MX",
            opciones
        );

    const fin =
        finSemana.toLocaleDateString(
            "es-MX",
            opciones
        );

    return `Semana del ${inicio} al ${fin}`;
}

async function cargarHistorialMercancia() {
  const contenedor = document.getElementById("lista-mercancia");
  if (!contenedor) return;
  contenedor.innerHTML = "<p>Cargando historial...</p>";

  try {
    const { collection, getDocs } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    const querySnapshot = await getDocs(collection(window.db, "movimientos"));

    if (querySnapshot.empty) {
      contenedor.innerHTML = "<p style='color: #7f8c8d; font-style: italic;'>Sin movimientos registrados aún.</p>";
      return;
    }

    const movimientosPorSemana = {};
    querySnapshot.forEach((docSnap) => {

        const mov = docSnap.data();

        const infoSemana =
            obtenerSemana(
                mov.timestamp
            );

        const clave =

            `${infoSemana.anio}-S${infoSemana.semana}`;

        if (!movimientosPorSemana[clave]) {

            movimientosPorSemana[clave] = [];

        }

        movimientosPorSemana[clave].push(
            mov
        );

    });

    let html = "";
    Object.keys(movimientosPorSemana)
    .sort()
    .reverse()
    .forEach(semana => {
     
        const rangoSemana =
            obtenerRangoSemana(
                movimientosPorSemana[semana][0]
                .timestamp
            );
         
        html += `
         
        <details
            style="
                margin-bottom:15px;
                background:#fff;
                border:1px solid #ddd;
                border-radius:6px;
                padding:10px;
            ">
         
            <summary
                style="
                    cursor:pointer;
                    font-weight:bold;
                    color:#2c3e50;
                ">
         
                ${rangoSemana}
         
                (${movimientosPorSemana[semana].length}
                movimientos)
         
            </summary>
         
        `;
        movimientosPorSemana[semana].sort( (a, b) => b.timestamp - a.timestamp );
        movimientosPorSemana[semana]
     
        .forEach(mov => {
     
            const colorBorde =
                mov.tipo.includes(
                    "ENTRADA"
                )
                ? "#2ecc71"
                : "#e74c3c";
     
            html += `
     
            <div
                style="
                    background:#f9f9f9;
                    margin-top:10px;
                    padding:12px;
                    border-left:4px solid ${colorBorde};
                    border-radius:4px;
                ">
     
                <strong>
                    [${mov.tipo}]
                </strong>
     
                <br><br>
     
                Producto:
                <strong>
                    ${mov.nombre}
                </strong>
     
                <br>
     
                Código:
                ${mov.codigo}
     
                <br>
     
                Cantidad:
                <strong>
                    ${mov.cantidad}
                </strong>
     
                <br>
     
                Usuario:
                <strong>
                    ${mov.usuario}
                </strong>
     
                <br>
     
                Rol:
                ${
                    mov.rol === "admin"
                    ? "Administrador"
                    : "Mecánico"
                }
     
                <br>
     
                <small>
                    ${mov.fecha}
                </small>
     
            </div>
     
            `;
     
        });
     
        html += "</details>";
     
    });

    contenedor.innerHTML = html;
  } catch (error) {
    console.error("Error cargando movimientos:", error);
    contenedor.innerHTML = "<p style='color: red;'>Error al cargar el historial.</p>";
  }
}

async function procesarXMLProductos() {
 
  const archivo =
    document.getElementById(
      "file-xml-productos"
    ).files[0];
 
  if (!archivo) {
 
    alert(
      "Selecciona un XML"
    );
 
    return;
 
  }
 
  const lector =
    new FileReader();
 
  lector.onload = async function(e) {
 
    try {
 
      const contenido =
        e.target.result;
 
      const parser =
        new DOMParser();
 
      const xmlDoc =
        parser.parseFromString(
          contenido,
          "text/xml"
        );
        
 
      let items = xmlDoc.getElementsByTagName( "cfdi:Concepto" );
      if (items.length === 0) items = xmlDoc.getElementsByTagName( "Concepto" ); 
      if (items.length === 0) items = xmlDoc.getElementsByTagName( "Item" );
      if (items.length === 0) items = xmlDoc.getElementsByTagName( "producto" );
      productosXMLDetectados = [];
      console.log( "Productos encontrados:", items );
 
      const { doc, getDoc } = await import( "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
      let html ="<h3>Productos encontrados</h3><ul>";
      
      for (let i = 0; i < items.length; i++) {
 
        const item = items[i];
        const codigo =
          item.getAttribute(
            "NoIdentificacion"
          ) ||
          item.getAttribute(
            "codigo"
          );
 
        const nombre =
          item.getAttribute(
            "Descripcion"
          ) ||
          item.getAttribute(
            "nombre"
          );
 
        const ref =
          doc(
            window.db,
            "productos",
            codigo
          );
 
        const snap =
          await getDoc(ref);
 
        if (!snap.exists()) {
 
          productosXMLDetectados.push({
            codigo,
            nombre
          });
 
          html += `
            <li style="color:green;">
               NUEVO:
              <strong>${codigo}</strong>
              - ${nombre}
            </li>
          `;
 
        } else {
 
          html += `
            <li style="color:#7f8c8d;">
              ✔ Existe:
              <strong>${codigo}</strong>
              - ${nombre}
            </li>
          `;
        }
      }
 
      html += "</ul>";
 
      document.getElementById(
        "resultado-registro-xml"
      ).innerHTML = html;
 
      if (
        productosXMLDetectados.length > 0
      ) {
 
        document.getElementById(
          "btnRegistrarXML"
        ).style.display =
        "inline-block";
 
      }
 
    } catch(error) {
 
      console.error(error);
 
      alert(
        "Error al leer XML"
      );
 
    }
 
  };
 
  lector.readAsText(archivo);
 
}

async function registrarProductosXML() {
 
  try {
 
    const {
      doc,
      setDoc
    } = await import(
      "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"
    );
 
    let contador = 0;
 
    for (
      const producto
      of productosXMLDetectados
    ) {
 
      await setDoc(
 
        doc(
          window.db,
          "productos",
          producto.codigo
        ),
 
        {
          codigo:
            producto.codigo,
 
          nombre:
            producto.nombre,
 
          stock: 0,
          stockMinimo: 0,
          fechaCreacion:new Date()
            
        }
      );
      contador++;
    }
 
    alert( `${contador} productos agregados al catálogo` );
    productosXMLDetectados = [];
    document.getElementById( "resultado-registro-xml" ).innerHTML = "<p>Registro completado correctamente.</p>";
    document.getElementById( "file-xml-productos" ).value = "";
    document.getElementById( "btnRegistrarXML" ).style.display = "none";
  } catch(error) { console.error(error); alert( "Error al registrar productos" ); }
}

const formUsuario =
document.getElementById("formUsuario");
 
if (formUsuario) {
 
    formUsuario.addEventListener(
        "submit",
 
        async function(event) {
 
            event.preventDefault();
 
            const nombre =
                document.getElementById(
                    "nombreUsuario"
                ).value.trim();
 
            const correo =
                document.getElementById(
                    "correoUsuario"
                ).value.trim();
 
            const password =
                document.getElementById(
                    "passwordUsuario"
                ).value;
 
            const rol =
                document.getElementById(
                    "rolUsuario"
                ).value;
 
            try {
 
                    const {
                        collection,
                        query,
                        where,
                        getDocs,
                        doc,
                        setDoc
                    } = await import(
                        "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"
                    );
                 
                    const consulta = query(
                        collection(
                            window.db,
                            "usuarios"
                        ),
                        where(
                            "correo",
                            "==",
                            correo
                        )
                    );
                 
                    const resultado =
                        await getDocs(
                            consulta
                        );
                 
                    if (!resultado.empty) {
                 
                        alert(
                            "Ya existe un usuario con ese correo."
                        );
                 
                        return;
                    }
                 
                    const credencial =
                        await window.createUserWithEmailAndPassword(
                 
                            window.secondaryAuth,
                            correo,
                            password
                 
                        );
                 
                    const uid =
                        credencial.user.uid;
                 
                    await setDoc(
                 
                        doc(
                            window.db,
                            "usuarios",
                            uid
                        ),
                 
                        {
                            nombre,
                            correo,
                            rol,
                            fechaCreacion:
                                new Date()
                        }
                 
                    );
                 
                    await window.secondaryAuth.signOut();
                 
                    alert(
                        "Usuario creado correctamente."
                    );
                 
                    formUsuario.reset();
                 
                    await cargarUsuarios();
 
            } catch(error) {
                console.error(error);
                alert(
                    "Error al guardar usuario."
                );
            }
        }
    );
}

async function cargarUsuarios() {
 
    const contenedor =
        document.getElementById(
            "listaUsuarios"
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
                    "usuarios"
                )
            );
 
        if (snapshot.empty) {
 
            contenedor.innerHTML =
                "<p>No hay usuarios registrados.</p>";
 
            return;
 
        }
 
        let html = "";
 
        snapshot.forEach(doc => {
 
            const usuario = doc.data();
 
            html += `
 
                <div style="
                    background:#f4f4f4;
                    padding:10px;
                    margin-bottom:10px;
                    border-radius:5px;
                ">
                    <strong>
                        ${usuario.nombre}
                    </strong> <br>
                    ${usuario.correo} <br>
                    Rol:
                    ${usuario.rol === "admin" ? "Administrador" : usuario.rol === "mecanico" ? "Mecánico" : usuario.rol}
 
                </div> `;
        });
        contenedor.innerHTML = html;
    } catch(error) {
        console.error(error);
    }
}

function aplicarPermisosPorRol(rol) {

    const elementosAdmin =
        document.querySelectorAll(
            ".admin-only, .admin-only-section"
        );

    elementosAdmin.forEach(elemento => {

        if (rol === "admin") {

            elemento.style.display = "";

        } else {

            elemento.style.display = "none";

        }

    });

}
function mostrarHistorial() {

    const seccion =
        document.getElementById(
            "mercancia"
        );
     
    if (seccion) {
     
        seccion.style.maxWidth =
            "900px";
     
    }
    document.getElementById(
        "lista-mercancia"
    ).style.display =
    "block";

    document.getElementById(
        "lista-proveedores"
    ).style.display =
    "none";

    document.getElementById(
        "btn-historial"
    ).style.background =
    "#3498db";

}

function mostrarProveedores() {


    const seccion =
        document.getElementById(
            "mercancia"
        );
     
    if (seccion) {
     
        seccion.dataset.anchoOriginal =
            seccion.style.maxWidth;
     
        seccion.style.maxWidth =
            "1300px";
     
    }
    document.getElementById(
        "lista-mercancia"
    ).style.display =
    "none";

    document.getElementById(
        "lista-proveedores"
    ).style.display =
    "block";

    document.getElementById(
        "btn-proveedores"
    ).style.background =
    "#3498db";

    document.getElementById(
        "btn-historial"
    ).style.background =
    "#95a5a6";

    cargarReporteProveedores();

}

async function guardarStockMinimo(
    codigo
) {

    try {

        const {
            doc,
            updateDoc
        } = await import(
            "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"
        );

        const valor = parseInt(

            document.getElementById(
                `stock-min-${codigo}`
            ).value

        ) || 0;

        await updateDoc(

            doc(
                window.db,
                "productos",
                codigo
            ),

            {

                stockMinimo:
                    valor

            }

        );

        alert(
            "Stock mínimo actualizado."
        );

    }

    catch(error) {

        console.error(error);

        alert(
            "Error al actualizar."
        );

    }

}