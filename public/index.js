document.addEventListener('DOMContentLoaded', function () {
    const apiKeyInput = document.getElementById('apiKeyInput');
    const saveApiKeyButton = document.getElementById('saveApiKeyButton');
    const uploadButton = document.getElementById('uploadButton');
    const errorMessage = document.getElementById('errorMessage');
    const fileInput = document.getElementById('fileInput');

    // Проверка наличия API-ключа в localStorage при загрузке страницы
    const apiKey = localStorage.getItem('apiKey');
    if (!apiKey) {
        errorMessage.style.display = 'block';
        errorMessage.innerText = 'API-ключ не найден. Пожалуйста, введите ключ.';
        uploadButton.disabled = true;
    } else {
        errorMessage.style.display = 'none';
        uploadButton.disabled = true; // Кнопка "Выгрузить" по умолчанию заблокирована
    }

    // Сохранение API-ключа в localStorage
    saveApiKeyButton.addEventListener('click', function () {
        const newApiKey = apiKeyInput.value.trim();
        if (newApiKey) {
            localStorage.setItem('apiKey', newApiKey);
            errorMessage.style.display = 'none';
            uploadButton.disabled = !fileInput.files.length; // Разблокируем кнопку "Выгрузить", если файл выбран
        } else {
            errorMessage.style.display = 'block';
            errorMessage.innerText = 'API-ключ не найден. Пожалуйста, введите ключ.';
            uploadButton.disabled = true;
        }
    });

    // Проверка наличия файла для выгрузки
    fileInput.addEventListener('change', function () {
        uploadButton.disabled = !apiKey || !fileInput.files.length;
    });

    document.getElementById('uploadButton').addEventListener('click', function () {
        const uploadButton = document.getElementById('uploadButton');
        if (uploadButton.disabled) return; // Если кнопка уже заблокирована, ничего не делаем

        uploadButton.disabled = true; // Блокируем кнопку

        const file = fileInput.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function (event) {
            const data = new Uint8Array(event.target.result);
            const workbook = XLSX.read(data, {type: 'array'});
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, {header: 1});

            const processedRows = new Map(); // Карта для отслеживания уже обработанных строк

            const processRow = (row) => {
                if (row.length < 2 || !row[1]) {
                    return Promise.resolve([row[0] || '', '', '', '', '']);
                }

                const inn = row[1]; // ИНН находится во втором столбце
                if (processedRows.has(inn)) {
                    return processedRows.get(inn);
                }

                const apiKey = localStorage.getItem('apiKey'); // Получаем актуальный ключ из localStorage
                if (!apiKey) {
                    throw new Error('API-ключ не найден. Пожалуйста, введите ключ.');
                }

                const promise = fetchWithRetry(`https://api.checko.ru/v2/company?key=${apiKey}&inn=${inn}`)
                    .then(response => {
                        if (!response.ok) {
                            if (response.status === 401) {
                                return response.json().then(data => {
                                    throw new Error(`Unauthorized: ${data.meta.message}`);
                                });
                            }
                            return response.json().then(data => {
                                throw new Error(`HTTP error! status: ${response.status}, message: ${data.meta.message}`);
                            });
                        }
                        return response.json();
                    })
                    .then(data => {
                        if (data.data && data.data.Руковод) {
                            const directorInn = findData(data.data.Руковод, 'ИНН'); // ИНН руководителя
                            const directorFio = findData(data.data.Руковод, 'ФИО'); // ФИО руководителя
                            const contacts = data.data.Контакты && data.data.Контакты.Тел ? data.data.Контакты.Тел.join(', ') : ''; // Контакты через запятую
                            return [row[0] || '', inn, directorInn, directorFio, contacts];
                        } else {
                            return [row[0] || '', inn, '', '', ''];
                        }
                    })
                    .catch(error => {
                        console.error(`Error fetching data for INN ${inn}:`, error);
                        throw error; // Перебрасываем ошибку, чтобы прервать цикл
                    });

                processedRows.set(inn, promise); // Добавляем промис в карту
                return promise;
            };

            document.getElementById('loader-custom').style.display = 'block';
            document.getElementById('output').innerText = '';

            const totalRows = jsonData.length - 1; // Исключаем первую строку с заголовками
            let processedRowsCount = 0;

            const processRows = async () => {
                const processedData = [];
                try {
                    for (const row of jsonData.slice(1)) {
                        if (row.length < 2 || !row[1]) {
                            break; // Прерываем цикл, если строка пустая
                        }

                        const result = await processRow(row);
                        processedData.push(result);
                        processedRowsCount++;
                        document.getElementById('output').innerText = `Обработано строк: ${processedRowsCount}/${totalRows}`;
                    }
                } catch (error) {
                    console.error('Error processing data:', error);
                    errorMessage.style.display = 'block';
                    errorMessage.innerText = error.message;
                } finally {
                    // Добавляем заголовки в первую строку
                    processedData.unshift(['Наименование организации', 'ИНН', 'ИНН руководителя', 'Руковод.ФИО', 'Телефон']);
                    return processedData;
                }
            };

            processRows()
                .then(processedData => {
                    const newWorkbook = XLSX.utils.book_new();
                    const newWorksheet = XLSX.utils.aoa_to_sheet(processedData);
                    XLSX.utils.book_append_sheet(newWorkbook, newWorksheet, 'Processed Data');

                    const wbout = XLSX.write(newWorkbook, {bookType: 'xlsx', type: 'array'});
                    const blob = new Blob([wbout], {type: 'application/octet-stream'});
                    saveAs(blob, 'processed_data.xlsx');

                    document.getElementById('loader-custom').style.display = 'none';
                    document.getElementById('output').innerText = 'Файл загружен';
                    uploadButton.disabled = false; // Разблокируем кнопку после завершения
                })
                .catch(error => {
                    console.error('Error processing data:', error);
                    document.getElementById('loader-custom').style.display = 'none';
                    document.getElementById('output').innerText = 'Ошибка';
                    uploadButton.disabled = false; // Разблокируем кнопку в случае ошибки
                });
        };

        reader.readAsArrayBuffer(file);
    });

    // Функция для рекурсивного поиска данных
    function findData(obj, key) {
        if (obj && typeof obj === 'object') {
            if (Array.isArray(obj)) {
                for (let item of obj) {
                    const result = findData(item, key);
                    if (result) {
                        return result;
                    }
                }
            } else {
                for (let k in obj) {
                    if (k === key) {
                        return obj[k];
                    }
                    const result = findData(obj[k], key);
                    if (result) {
                        return result;
                    }
                }
            }
        }
        return null;
    }

    // Функция для повторных попыток с экспоненциальной задержкой
    async function fetchWithRetry(url, options = {}, retries = 3, delay = 1000) {
        try {
            const response = await fetch(url, options);
            if (response.status === 429) {
                throw new Error('Too Many Requests');
            }
            return response;
        } catch (error) {
            if (retries > 0) {
                console.warn(`Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return fetchWithRetry(url, options, retries - 1, delay * 2);
            } else {
                throw error;
            }
        }
    }
});