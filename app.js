let streamActivo = null;
let modoActualEscanner = null; 
let codigoEscaneadoTemp = "";

function cambiarSeccion(seccionId, evento) {
  document.querySelectorAll('.section-content').forEach(sec => sec.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(tab => tab.classList.remove('active'));

  document.getElementById(seccionId).classList.add('active');
  evento.currentTarget.classList.add('active');

  detenerCamara();
  if (seccionId === 'entradas') {
    iniciarCamara('entrada');
  } else if (seccionId === 'salidas') {
    iniciarCamara('salida');
  } else if (seccionId === 'actual') {
    cargarInventarioActual();
  } else if (seccionId === 'mercancia') {
    cargarHistorialMercancia();
  }
}

// 1. GUARDAR NUEVO PRODUCTO EN FIRESTORE
async function guardarNuevoProducto() {
  const codigo = document.getElementById("codigo-reg").value.trim();
  const nombre = document.getElementById("nombre-reg").value.trim();
  
  if (!codigo || !nombre) {
    alert("Por favor completa el código y el nombre del producto.");
    return;
  }

  try {
    // Importamos las funciones necesarias de Firestore que están globales en window.db (o mediante el SDK)
    const { collection, doc, setDoc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    
    // Guardamos usando el código como ID único del documento en la colección 'productos'
    await setDoc(doc(window.db, "productos", codigo), {
      codigo: codigo,
      nombre: nombre,
      stock: 0,
      fechaCreacion: new Date()
    });

    const contenedor = document.getElementById("qrcode");
    contenedor.innerHTML = "";
    
    QRCode.toCanvas(codigo, { width: 180 }, function (err, canvas) {
      if (err) { console.error(err); return; }
      contenedor.appendChild(canvas);
    });

    alert(`Producto "${nombre}" registrado con éxito en la nube.`);
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

// 2. CONFIRMAR ENTRADA EN LA NUBE
async function confirmarEntrada() {
  const cantidad = parseInt(document.getElementById("cantidad-entrada").value);
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
      await updateDoc(prodRef, { stock: stockActual + cantidad });
    } else {
      // Si escanean un código que no se dio de alta previamente, lo creamos automáticamente
      await updateDoc(prodRef, { codigo: codigoEscaneadoTemp, nombre: "Sin Nombre (Escaneado)", stock: cantidad });
    }

    // Registrar movimiento
    await addDoc(collection(window.db, "movimientos"), {
      tipo: "ENTRADA",
      codigo: codigoEscaneadoTemp,
      nombre: nombreProducto,
      cantidad: cantidad,
      fecha: new Date().toLocaleString()
    });

    alert(`[Entrada Exitosa] Se agregaron ${cantidad} unidades de "${nombreProducto}" a la nube.`);
    reiniciarEscaneo('entrada');
  } catch (error) {
    console.error("Error al registrar entrada:", error);
    alert("Error al conectar con la base de datos.");
  }
}

// 3. CONFIRMAR SALIDA EN LA NUBE
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

    // Registrar movimiento de salida
    await addDoc(collection(window.db, "movimientos"), {
      tipo: "SALIDA",
      codigo: codigoEscaneadoTemp,
      nombre: nombreProducto,
      cantidad: cantidad,
      fecha: new Date().toLocaleString()
    });

    alert(`[Salida Registrada] Se retiraron ${cantidad} unidades de "${nombreProducto}".`);
    reiniciarEscaneo('salida');
  } catch (error) {
    console.error("Error al registrar salida:", error);
    alert("Error al procesar la salida.");
  }
}

// 4. CARGAR INVENTARIO ACTUAL
async function cargarInventarioActual() {
  const contenedor = document.getElementById("lista-inventario");
  contenedor.innerHTML = "<p>Cargando inventario desde la nube...</p>";

  try {
    const { collection, getDocs } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    const querySnapshot = await getDocs(collection(window.db, "productos"));

    if (querySnapshot.empty) {
      contenedor.innerHTML = "<p style='color: #7f8c8d; font-style: italic;'>No hay productos registrados.</p>";
      return;
    }

    let html = "<ul style='list-style: none; padding: 0;'>";
    querySnapshot.forEach((doc) => {
      const prod = doc.data();
      html += `<li style='background: #f9f9f9; margin-bottom: 8px; padding: 10px; border-radius: 4px; border-left: 4px solid #3498db;'>
        <strong>${prod.nombre}</strong> (${prod.codigo})<br>
        Stock Actual: <span style='font-size: 1.1em; color: #2c3e50; font-weight: bold;'>${prod.stock || 0}</span>
      </li>`;
    });
    html += "</ul>";
    contenedor.innerHTML = html;
  } catch (error) {
    console.error("Error cargando inventario:", error);
    contenedor.innerHTML = "<p style='color: red;'>Error al cargar las existencias.</p>";
  }
}

// 5. CARGAR HISTORIAL DE MERCANCÍA / MOVIMIENTOS
async function cargarHistorialMercancia() {
  const contenedor = document.getElementById("lista-mercancia");
  contenedor.innerHTML = "<p>Cargando historial...</p>";

  try {
    const { collection, getDocs } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    const querySnapshot = await getDocs(collection(window.db, "movimientos"));

    if (querySnapshot.empty) {
      contenedor.innerHTML = "<p style='color: #7f8c8d; font-style: italic;'>Sin movimientos registrados aún.</p>";
      return;
    }

    let html = "<ul style='list-style: none; padding: 0;'>";
    querySnapshot.forEach((doc) => {
      const mov = doc.data();
      const colorBorde = mov.tipo === "ENTRADA" ? "#2ecc71" : "#e74c3c";
      html += `<li style='background: #f9f9f9; margin-bottom: 8px; padding: 10px; border-radius: 4px; border-left: 4px solid ${colorBorde};'>
        <strong>[${mov.tipo}]</strong> ${mov.nombre} (${mov.codigo})<br>
        Cantidad: ${mov.cantidad} — <small style='color: gray;'>${mov.fecha}</small>
      </li>`;
    });
    html += "</ul>";
    contenedor.innerHTML = html;
  } catch (error) {
    console.error("Error cargando movimientos:", error);
    contenedor.innerHTML = "<p style='color: red;'>Error al cargar el historial.</p>";
  }
}