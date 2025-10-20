// Tarifas por hora (en dólares)
const tarifas = {
    auto: 5,
    moto: 3
};

// Arrays para datos
let estacionados = JSON.parse(localStorage.getItem('estacionados')) || [];
let historial = JSON.parse(localStorage.getItem('historial')) || [];

// Función para ingresar vehículo
function ingresarVehiculo() {
    const placa = document.getElementById('placa').value.trim().toUpperCase();
    const tipo = document.getElementById('tipo').value;
    
    if (placa === '') {
        alert('Ingresa una placa válida');
        return;
    }
    
    if (estacionados.some(v => v.placa === placa)) {
        alert('Este vehículo ya está estacionado');
        return;
    }
    
    const vehiculo = {
        placa,
        tipo,
        entrada: new Date().toISOString()
    };
    
    estacionados.push(vehiculo);
    guardarDatos();
    renderizarListas();
    document.getElementById('placa').value = '';
}

// Función para salida y cálculo de cobro
function salidaVehiculo(index) {
    const vehiculo = estacionados[index];
    const salida = new Date();
    const entrada = new Date(vehiculo.entrada);
    
    // Calcular tiempo en minutos
    const tiempoMinutos = Math.ceil((salida - entrada) / (1000 * 60));
    const horas = Math.ceil(tiempoMinutos / 60); // Redondeo hacia arriba por hora
    
    const tarifaHora = tarifas[vehiculo.tipo];
    const cobro = horas * tarifaHora;
    
    const registro = {
        ...vehiculo,
        salida: salida.toISOString(),
        tiempoMinutos,
        cobro
    };
    
    historial.push(registro);
    estacionados.splice(index, 1);
    guardarDatos();
    renderizarListas();
    
    alert(`Vehículo ${vehiculo.placa} (${vehiculo.tipo})\nTiempo: ${tiempoMinutos} minutos\nCobro: $${cobro}`);
}

// Renderizar listas
function renderizarListas() {
    const listaEstacionados = document.getElementById('listaEstacionados');
    listaEstacionados.innerHTML = '';
    
    estacionados.forEach((v, index) => {
        const li = document.createElement('li');
        li.innerHTML = `
            <span>${v.placa} - ${v.tipo} (Entrada: ${new Date(v.entrada).toLocaleString()})</span>
            <button onclick="salidaVehiculo(${index})">Salida</button>
        `;
        listaEstacionados.appendChild(li);
    });
    
    const listaHistorial = document.getElementById('listaHistorial');
    listaHistorial.innerHTML = '';
    
    historial.forEach(v => {
        const li = document.createElement('li');
        li.innerHTML = `
            <span>${v.placa} - ${v.tipo} (Salida: ${new Date(v.salida).toLocaleString()}) - Cobro: $${v.cobro}</span>
        `;
        listaHistorial.appendChild(li);
    });
}

// Guardar en localStorage
function guardarDatos() {
    localStorage.setItem('estacionados', JSON.stringify(estacionados));
    localStorage.setItem('historial', JSON.stringify(historial));
}

// Inicializar
renderizarListas();
