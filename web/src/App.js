import React, { Component } from 'react';
import axios from 'axios';
import euro10 from './img/euro10.png';
import euro20 from './img/euro20.png';
import euro50 from './img/euro50.png';
import euro100 from './img/euro100.png';
import './app.scss';

class App extends Component {
  state = {
    bills: [
      {
        id: 10,
        label: '$10',
        amount: 0,
        imgSrc: euro10
      },
      {
        id: 20,
        label: '$20',
        amount: 0,
        imgSrc: euro20
      },
      {
        id: 50,
        label: '$50',
        amount: 0,
        imgSrc: euro50
      },
      {
        id: 100,
        label: '$100',
        amount: 0,
        imgSrc: euro100
      },
    ],
    isLoading: false,
    hasError: false,
    hasReturn: false,
    valueInput: '',
  }

  onValueChange = (e) => {
    this.setState({ valueInput: e.target.value });
  }

  calculateBills = () => {
    const { bills, valueInput } = this.state;
    this.setState({
      isLoading: true
    }, () => {
      axios.post('http://localhost:3001/api/withdraw', { value: valueInput })
        .then(res => {
          setTimeout(() => {
            const data = res.data.data;
            const currentDataIds = data.map(bill => bill.note)
            const currentBankNotes = bills.map(bankNote => {
              data.map(bill => {
                if(bankNote.id === bill.note) {
                  bankNote.amount = bill.qty;
                }
                return bill;
              })
    
              if(!currentDataIds.includes(bankNote.id)) {
                bankNote.amount = 0;
              }
    
              return bankNote;
            })
            this.setState({ bills: currentBankNotes, isLoading: false, hasError: false, hasReturn: true })
          }, 200)
        })
        .catch(() => {
          this.setState({ isLoading: false, hasError: true, hasReturn: true })
        })
    })
  }

  render() {
    const { bills, isLoading, hasError, hasReturn, valueInput } = this.state;

    return (
      <div className="app">
        <div className='value'>
          <label htmlFor='valueInput' className='value__InputGroup'>
            <span>Valor:</span>
            <input
              autoComplete="off"
              className='input'
              id='valueInput'
              name='valueInput'
              type='number'
              // onBlur={() => this.calculateBills()}
              onKeyPress={(e) => {
                  if(e.key === 'Enter') this.calculateBills()
                }
              }
              step='10'
              min='0'
              onChange={(e) => this.onValueChange(e)}
              value={valueInput}
            />
          </label>
          <button
            className='value__button'
            disabled={valueInput === '0' || valueInput.trim().length === 0}
            onClick={() => this.calculateBills()}
          >
            Salvar
          </button>
        </div>
        {
          isLoading
          ? <div className='loading'></div>
          : hasReturn
            ? (
                <div className='bill'>
                  {
                    bills.map(bill => {
                      return (
                        <div className='bill__column' key={bill.label}>
                          <h2 className='bill__label'>{bill.label} <span>- {bill.amount} nota</span></h2>
                          <div className='bill__container'>
                            {
                              Array.from(Array(bill.amount), (e, i) => {
                                return (
                                  <img
                                    alt={bill.label}
                                    className='bill__banknote'
                                    key={i}
                                    src={bill.imgSrc}
                                  />
                                )
                              })
                            }
                          </div>
                        </div>
                      )
                    })
                  }
                </div>
              )
            : (
                <div className='center'>
                  <h2>{hasError ? 'Valor inválido' : 'Digite um valor para começar'}</h2>
                </div>
              )
        }
      </div>
    );
  }
}

export default App;
